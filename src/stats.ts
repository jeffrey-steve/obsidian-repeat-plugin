import { App, Modal } from 'obsidian';
// @ts-ignore
import { getAPI } from 'obsidian-dataview';
import { getNotesDue } from './repeat/queries';
import { DEFAULT_SETTINGS, RepeatPluginSettings } from './settings';

export class StatsModal extends Modal {
    settings: RepeatPluginSettings;

    constructor(app: App, settings: RepeatPluginSettings) {
        super(app);
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'SRS Statistics' });

        this.renderStats(contentEl);
    }

    async renderStats(el: HTMLElement) {
        el.createEl('p', { text: 'Loading stats...' });

        // 1. Future Due Counts (using DataView/Queries)
        const dv = getAPI(this.app);
        if (!dv) {
            el.empty();
            el.createEl('p', { text: 'Dataview API not available.' });
            return;
        }

        // We can't easily get strict future counts without iterating all files or using a complex query
        // But we can get "Total Due Now" easily.
        const dueNow = getNotesDue(dv, this.settings.ignoreFolderPath, undefined, this.settings.enqueueNonRepeatingNotes, this.settings.defaultRepeat)?.length || 0;

        // 2. Revlog Stats
        let totalReviews = 0;
        let retentionRate = 0;
        let todayReviews = 0;

        try {
            const revlogPath = '.obsidian/plugins/obsidian-repeat-plugin/revlog.csv';
            if (await this.app.vault.adapter.exists(revlogPath)) {
                const content = await this.app.vault.adapter.read(revlogPath);
                const lines = content.split('\n').slice(1); // Skip header
                totalReviews = lines.length;

                // Simple Retention: Count of 'Good'(3) + 'Easy'(4) vs Total (excluding 'Manual'(0)?)
                // Rating: 1=Again, 2=Hard, 3=Good, 4=Easy.
                // Retention usually measures "Pass" vs "Fail". 
                // Pass = Hard, Good, Easy. Fail = Again.
                let passCount = 0;
                let failCount = 0;

                const now = Date.now();
                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);

                lines.forEach(line => {
                    const parts = line.split(',');
                    if (parts.length < 3) return;
                    const time = parseInt(parts[1]);
                    const rating = parseInt(parts[2]);

                    if (rating >= 2) passCount++;
                    if (rating === 1) failCount++;

                    if (time >= startOfDay.getTime()) {
                        todayReviews++;
                    }
                });

                if (passCount + failCount > 0) {
                    retentionRate = (passCount / (passCount + failCount)) * 100;
                }
            }
        } catch (e) {
            console.error("Error reading revlog", e);
        }

        el.empty();
        el.createEl('h2', { text: 'SRS Statistics' });

        const statsContainer = el.createDiv({ cls: 'srs-stats-container' });

        // CSS for grid
        statsContainer.style.display = 'grid';
        statsContainer.style.gridTemplateColumns = '1fr 1fr';
        statsContainer.style.gap = '20px';

        const createStat = (label: string, value: string) => {
            const div = statsContainer.createDiv({ cls: 'srs-stat-box' });
            div.style.border = '1px solid var(--background-modifier-border)';
            div.style.padding = '15px';
            div.style.borderRadius = '8px';
            div.style.textAlign = 'center';

            div.createEl('div', { text: label, cls: 'srs-stat-label' }).style.color = 'var(--text-muted)';
            div.createEl('div', { text: value, cls: 'srs-stat-value' }).style.fontSize = '24px';
            div.createEl('div', { text: '', cls: 'srs-stat-sub' }); // Placeholder
        };

        createStat('Due Now', dueNow.toString());
        createStat('Reviews Today', todayReviews.toString());
        createStat('Total Reviews', totalReviews.toString());
        createStat('Retention Rate', retentionRate.toFixed(1) + '%');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
