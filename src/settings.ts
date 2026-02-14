import { Repeat } from "./repeat/repeatTypes";

export interface SavedFilter {
  name: string;
  query: string;  // Dataview FROM expression, e.g. "#math" or "#math AND \"Courses\""
}

import { FSRSParameters, default_parameters } from './fsrs/fsrs';

export interface RepeatPluginSettings {
  showDueCountInStatusBar: boolean;
  showRibbonIcon: boolean;
  ignoreFolderPath: string;
  morningReviewTime: string;
  eveningReviewTime: string;
  defaultRepeat: Repeat;
  enqueueNonRepeatingNotes: boolean;
  enableFSRS: boolean;
  fsrsParams: FSRSParameters;
  filterQuery: string;              // Current Dataview FROM expression
  savedFilters: SavedFilter[];      // Named filter presets
}

export const DEFAULT_SETTINGS: RepeatPluginSettings = {
  showDueCountInStatusBar: true,
  showRibbonIcon: true,
  ignoreFolderPath: '',
  morningReviewTime: '08:00',
  eveningReviewTime: '20:00',
  defaultRepeat: {
    repeatStrategy: 'PERIODIC',
    repeatPeriod: 1,
    repeatPeriodUnit: 'DAY',
    repeatTimeOfDay: 'AM',
  },
  enqueueNonRepeatingNotes: false,
  enableFSRS: false,
  fsrsParams: default_parameters,
  filterQuery: '',
  savedFilters: [],
};
