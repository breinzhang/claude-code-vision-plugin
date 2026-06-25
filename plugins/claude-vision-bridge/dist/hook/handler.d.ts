import type { AnalyzeImageRequest } from '../core/types.js';
export interface UserPromptSubmitInput {
    session_id: string;
    transcript_path?: string;
    cwd: string;
    hook_event_name: 'UserPromptSubmit';
    prompt: string;
    permission_mode?: string;
}
export declare function parseHookInputToRequests(input: UserPromptSubmitInput): AnalyzeImageRequest[];
export declare function isManualMcpCommandPrompt(prompt: string): boolean;
export declare function buildHookOutput(markdowns: string[]): {
    suppressOutput: boolean;
    hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit';
        additionalContext: string;
    };
};
export declare function runHook(rawInput: string): Promise<string>;
