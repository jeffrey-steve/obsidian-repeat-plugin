import { App, FileSystemAdapter } from 'obsidian';

export interface RevlogEntry {
    card_id: string; // File path for now
    review_time: number;
    review_rating: number;
    review_state: number;
    review_duration: number; // Duration in ms
}

const REVLOG_FILE = '.obsidian/plugins/obsidian-repeat-plugin/revlog.csv';

export async function appendRevlog(app: App, entry: RevlogEntry) {
    const adapter = app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
        return; // Only works on desktop/filesystem adapter for direct appended writing usually, or we use .read/.write
    }

    // Format: card_id,review_time,review_rating,review_state,review_duration
    const line = `"${entry.card_id}",${entry.review_time},${entry.review_rating},${entry.review_state},${entry.review_duration}\n`;

    // Check if file exists, if not create with header
    const exists = await adapter.exists(REVLOG_FILE);
    if (!exists) {
        const header = "card_id,review_time,review_rating,review_state,review_duration\n";
        await adapter.write(REVLOG_FILE, header + line);
    } else {
        await adapter.append(REVLOG_FILE, line);
    }
}
