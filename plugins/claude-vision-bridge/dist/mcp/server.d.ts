import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AnalyzeImageResult } from '../core/types.js';
export declare const AnalyzeImageToolInputSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"path">;
        path: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"url">;
        url: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"clipboard">;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"base64">;
        mime: z.ZodString;
        data: z.ZodString;
    }, z.core.$strip>], "type">;
    mode: z.ZodDefault<z.ZodEnum<{
        general: "general";
        ui: "ui";
        ocr: "ocr";
        error: "error";
        chart: "chart";
        "document-screenshot": "document-screenshot";
    }>>;
    prompt: z.ZodDefault<z.ZodString>;
    preferredProvider: z.ZodOptional<z.ZodEnum<{
        ollama: "ollama";
        omlx: "omlx";
        llama_cpp: "llama_cpp";
        remote_openai: "remote_openai";
    }>>;
    preferredModel: z.ZodOptional<z.ZodString>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    maxOutputChars: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const ClearVisionCacheToolInputSchema: z.ZodObject<{
    kind: z.ZodDefault<z.ZodEnum<{
        success: "success";
        failure: "failure";
        all: "all";
    }>>;
}, z.core.$strip>;
type ToolCall = {
    name: string;
    arguments?: Record<string, unknown>;
};
type TextToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    structuredContent?: Record<string, unknown>;
};
type AnalyzeImageToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    structuredContent: AnalyzeImageResult;
};
export declare function listVisionTools(): Tool[];
export declare function handleAnalyzeImageResult(result: AnalyzeImageResult): AnalyzeImageToolResult;
export declare function sanitizeDoctorOutput(value: unknown): unknown;
export declare function handleMcpToolCall(call: ToolCall): Promise<TextToolResult | AnalyzeImageToolResult>;
export declare function createMcpServer(): Promise<Server>;
export {};
