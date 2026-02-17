import { DateTime } from 'luxon';
import {
  App,
  debounce,
  MarkdownView,
  Plugin,
  PluginManifest,
  PluginSettingTab,
  Setting,
  Platform,
  Notice,
} from 'obsidian';

import RepeatView, { REPEATING_NOTES_DUE_VIEW } from './repeat/obsidian/RepeatView';
import { StatsModal } from './stats';
import RepeatNoteSetupModal from './repeat/obsidian/RepeatNoteSetupModal';
import { RepeatPluginSettings, DEFAULT_SETTINGS } from './settings';
import { updateRepetitionMetadata } from './frontmatter';
import { getAPI } from 'obsidian-dataview';
import { getNotesDue } from './repeat/queries';
import { parseHiddenFieldFromMarkdown, parseRepeat, parseRepetitionFromMarkdown } from './repeat/parsers';
import { serializeRepeat, serializeRepetition } from './repeat/serializers';
import { incrementRepeatDueAt } from './repeat/choices';
import { PeriodUnit, Repetition, Strategy, TimeOfDay } from './repeat/repeatTypes';

const COUNT_DEBOUNCE_MS = 5 * 1000;

export default class RepeatPlugin extends Plugin {
  settings: RepeatPluginSettings;
  statusBarItem: HTMLElement | undefined;
  ribbonIcon: HTMLElement | undefined;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.updateNotesDueCount = debounce(
      this.updateNotesDueCount, COUNT_DEBOUNCE_MS).bind(this);
    this.manageStatusBarItem = this.manageStatusBarItem.bind(this);
    this.registerCommands = this.registerCommands.bind(this);
    this.makeRepeatRibbonIcon = this.makeRepeatRibbonIcon.bind(this);
  }

  async activateRepeatNotesDueView() {
    // Allow only one repeat view.
    this.app.workspace.detachLeavesOfType(REPEATING_NOTES_DUE_VIEW);

    // Create a new leaf for the view.
    await this.app.workspace.getLeaf(true).setViewState({
      type: REPEATING_NOTES_DUE_VIEW,
      active: true,
    });
    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(REPEATING_NOTES_DUE_VIEW)[0]
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (!this.settings.showDueCountInStatusBar && this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = undefined;
    }
    if (this.settings.showDueCountInStatusBar) {
      this.makeStatusBarItem();
      this.updateNotesDueCount();
    }
    if (!this.settings.showRibbonIcon && this.ribbonIcon) {
      this.ribbonIcon.remove();
      this.ribbonIcon = undefined;
    }
    if (this.settings.showRibbonIcon && !this.ribbonIcon) {
      this.makeRepeatRibbonIcon();
    }
  }

  makeStatusBarItem() {
    if (this.settings.showDueCountInStatusBar && !this.statusBarItem) {
      this.statusBarItem = this.addStatusBarItem();
      this.statusBarItem.addClass('mod-clickable');
      this.statusBarItem.setText('Repeat');
      this.statusBarItem.addEventListener('click', () => {
        this.activateRepeatNotesDueView();
      });
    }
  }

  updateNotesDueCount() {
    if (this.settings.showDueCountInStatusBar && this.statusBarItem) {
      const dueNoteCount = getNotesDue(
        getAPI(this.app),
        this.settings.ignoreFolderPath,
        undefined,
        this.settings.enqueueNonRepeatingNotes,
        this.settings.defaultRepeat)?.length;
      if (dueNoteCount != undefined) {
        this.statusBarItem.setText(
          `${dueNoteCount} repeat notes due`);
      }
    }
  }

  manageStatusBarItem() {
    // Create status bar item immediately so it's visible right away.
    this.makeStatusBarItem();

    const dv = getAPI(this.app);
    const onIndexReady = () => {
      this.updateNotesDueCount();
      // Update due note count whenever metadata changes.
      setTimeout(() => {
        this.registerEvent(
          this.app.metadataCache.on(
            // @ts-ignore: event is added by DataView.
            'dataview:metadata-change',
            this.updateNotesDueCount
          )
        );
      }, COUNT_DEBOUNCE_MS);
    };

    // If Dataview index is already ready, update immediately.
    // Otherwise, wait for the index-ready event.
    if (dv?.index.initialized) {
      onIndexReady();
    } else {
      this.registerEvent(
        this.app.metadataCache.on(
          // @ts-ignore: event is added by DataView.
          'dataview:index-ready',
          onIndexReady)
      );
    }

    // Periodically update due note count as notes become due.
    const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
    this.registerInterval(
      window.setInterval(this.updateNotesDueCount, FIVE_MINUTES_IN_MS)
    )
  }

  makeRepeatRibbonIcon() {
    if (this.settings.showRibbonIcon) {
      this.ribbonIcon = this.addRibbonIcon(
        'clock', 'Repeat due notes', () => {
          this.activateRepeatNotesDueView();
        }
      );
    }
  }

  registerCommands() {
    this.addCommand({
      id: 'setup-repeat-note',
      name: 'Repeat this note...',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const onSubmit = (result: Repetition) => {
          if (!markdownView || !markdownView.file) {
            return;
          }
          const { editor, file } = markdownView;
          const content = editor.getValue();
          const newContent = updateRepetitionMetadata(
            content, serializeRepetition(result));
          this.app.vault.modify(file, newContent);
        };
        if (markdownView) {
          if (!checking) {
            let repetition;
            if (markdownView) {
              const { editor } = markdownView;
              const content = editor.getValue();
              repetition = parseRepetitionFromMarkdown(content);
            }
            new RepeatNoteSetupModal(
              this.app,
              onSubmit,
              this.settings,
              repetition,
            ).open();
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'open-repeat-view',
      name: 'Review due notes',
      callback: () => {
        this.activateRepeatNotesDueView();
      },
    });

    ['day', 'week', 'month', 'year'].map((unit) => {
      this.addCommand({
        id: `repeat-every-${unit}`,
        name: `Repeat this note every ${unit}`,
        checkCallback: (checking: boolean) => {
          const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (markdownView && !!markdownView.file) {
            if (!checking) {
              const { editor, file } = markdownView;
              const content = editor.getValue();
              const repeat = {
                repeatStrategy: 'PERIODIC' as Strategy,
                repeatPeriod: 1,
                repeatPeriodUnit: unit.toUpperCase() as PeriodUnit,
                repeatTimeOfDay: 'AM' as TimeOfDay,
              };
              const repeatDueAt = incrementRepeatDueAt({
                ...repeat,
                repeatDueAt: undefined,
              } as any, this.settings);
              const newContent = updateRepetitionMetadata(content, serializeRepetition({
                ...repeat,
                hidden: parseHiddenFieldFromMarkdown(content),
                repeatDueAt,
                virtual: false,
              }));
              this.app.vault.modify(file, newContent);
            }
            return true;
          }
          return false;
        }
      });
    });

    this.addCommand({
      id: 'make-note-due-now',
      name: 'Mark this note as due now (for testing)',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView && !!markdownView.file) {
          if (!checking) {
            const { editor, file } = markdownView;
            const content = editor.getValue();
            const repetition = parseRepetitionFromMarkdown(content);
            if (repetition) {
              const newContent = updateRepetitionMetadata(content, serializeRepetition({
                ...repetition,
                repeatDueAt: DateTime.now().minus({ minutes: 1 }),
              }));
              this.app.vault.modify(file, newContent);
            }
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'repeat-never',
      name: 'Never repeat this note',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView && !!markdownView.file) {
          if (!checking) {
            const { editor, file } = markdownView;
            const content = editor.getValue();
            const newContent = updateRepetitionMetadata(content, {
              repeat: 'never',
              due_at: undefined,
              hidden: undefined,
            });
            this.app.vault.modify(file, newContent);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: 'repeat-never',
      name: 'Never repeat this note',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView && !!markdownView.file) {
          if (!checking) {
            const { editor, file } = markdownView;
            const content = editor.getValue();
            const newContent = updateRepetitionMetadata(content, {
              repeat: 'never',
              due_at: undefined,
              hidden: undefined,
            });
            this.app.vault.modify(file, newContent);
          }
          return true;
        }
        return false;
      }
    });
    this.addCommand({
      id: 'show-srs-stats',
      name: 'Show SRS Statistics',
      callback: () => {
        new StatsModal(this.app, this.settings).open();
      },
    });

    this.addCommand({
      id: 'export-revlog',
      name: 'Export Revlog to Vault Root',
      callback: async () => {
        const revlogPath = '.obsidian/plugins/obsidian-repeat-plugin/revlog.csv';
        if (await this.app.vault.adapter.exists(revlogPath)) {
          try {
            const content = await this.app.vault.adapter.read(revlogPath);
            // Create or overwrite
            const target = 'revlog_export.csv';
            if (await this.app.vault.adapter.exists(target)) {
              await this.app.vault.adapter.write(target, content);
              new Notice(`Revlog updated: ${target}`);
            } else {
              await this.app.vault.create(target, content);
              new Notice(`Revlog exported to ${target}`);
            }
          } catch (e) {
            new Notice('Failed to export revlog: ' + e.message);
          }
        } else {
          new Notice('No revlog data found yet.');
        }
      }
    });
  }

  async onload() {
    await this.loadSettings();
    this.makeRepeatRibbonIcon();
    this.manageStatusBarItem();
    this.registerCommands();
    this.registerView(
      REPEATING_NOTES_DUE_VIEW,
      (leaf) => new RepeatView(leaf, this.settings, this.saveSettings.bind(this)),
    );
    this.addSettingTab(new RepeatPluginSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(REPEATING_NOTES_DUE_VIEW);
  }
}

class RepeatPluginSettingTab extends PluginSettingTab {
  plugin: RepeatPlugin;

  constructor(app: App, plugin: RepeatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl('h2', { text: 'Repeat Plugin Settings' });

    new Setting(containerEl)
      .setName('Show due count in status bar')
      .setDesc('Whether to display how many notes are due in Obsidian\'s status bar.')
      .addToggle(component => component
        .setValue(this.plugin.settings.showDueCountInStatusBar)
        .onChange(async (value) => {
          this.plugin.settings.showDueCountInStatusBar = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Show ribbon icon')
      .setDesc('Whether to display the ribbon icon that opens the Repeat pane.')
      .addToggle(component => component
        .setValue(this.plugin.settings.showRibbonIcon)
        .onChange(async (value) => {
          this.plugin.settings.showRibbonIcon = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Ignore folder path')
      .setDesc('Notes in this folder and its subfolders will not become due. Useful to avoid reviewing templates.')
      .addText((component) => component
        .setValue(this.plugin.settings.ignoreFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.ignoreFolderPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Morning review time')
      .setDesc('When morning and long-term notes become due in the morning.')
      .addText((component) => {
        component.inputEl.type = 'time';
        component.inputEl.addClass('repeat-date_picker');
        component.setValue(this.plugin.settings.morningReviewTime);
        component.onChange(async (value) => {
          const usedValue = value >= '12:00' ? '11:59' : value;
          this.plugin.settings.morningReviewTime = usedValue;
          component.setValue(usedValue);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Evening review time')
      .setDesc('When evening notes become due in the afternoon.')
      .addText((component) => {
        component.inputEl.type = 'time';
        component.inputEl.addClass('repeat-date_picker');
        component.setValue(this.plugin.settings.eveningReviewTime);
        component.onChange(async (value) => {
          const usedValue = value < '12:00' ? '12:00' : value;
          this.plugin.settings.eveningReviewTime = usedValue;
          component.setValue(usedValue);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Default `repeat` property')
      .setDesc('Used to populate "Repeat this note..." command\'s modal. Ignored if the supplied value is not parsable.')
      .addText((component) => {
        return component
          .setValue(serializeRepeat(this.plugin.settings.defaultRepeat))
          .onChange(async (value) => {
            const newRepeat = parseRepeat(value);
            this.plugin.settings.defaultRepeat = newRepeat;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Enqueue non-repeating notes')
      .setDesc('Add notes without a repeat field to the end of the queue. Useful to quickly make new notes repeating during reviews.')
      .addToggle(component => component
        .setValue(this.plugin.settings.enqueueNonRepeatingNotes)
        .onChange(async (value) => {
          this.plugin.settings.enableFSRS = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('FSRS Request Retention')
      .setDesc('Target retention rate (0.7 - 0.99). Higher = more reviews.')
      .addText(text => text
        .setValue(String(this.plugin.settings.fsrsParams.request_retention))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0 && num < 1) {
            this.plugin.settings.fsrsParams.request_retention = num;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('FSRS Maximum Interval (days)')
      .setDesc('Maximum number of days between reviews.')
      .addText(text => text
        .setValue(String(this.plugin.settings.fsrsParams.maximum_interval))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.fsrsParams.maximum_interval = num;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('FSRS Weights (w)')
      .setDesc('The 19 parameters that define your memory model. Format: [w1, w2, ..., w19].')
      .addTextArea(text => text
        .setValue(JSON.stringify(this.plugin.settings.fsrsParams.w))
        .setPlaceholder('[0.4, 0.6, ...]')
        .onChange(async (value) => {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed.length === 19 && parsed.every((n: any) => typeof n === 'number')) {
              this.plugin.settings.fsrsParams.w = parsed;
              await this.plugin.saveSettings();
              new Notice('FSRS weights updated.');
            } else {
              new Notice('Invalid: Must be array of 19 numbers.');
            }
          } catch (e) {
            // efficient
          }
        }));

  }
}
