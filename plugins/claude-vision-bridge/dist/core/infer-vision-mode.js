export function inferVisionMode(prompt) {
    if (/\bocr\b/i.test(prompt))
        return 'ocr';
    if (/(提取|识别|读取|转写).{0,12}(文字|文本)/.test(prompt))
        return 'ocr';
    if (/(看得见|可见).{0,8}(文字|文本)/.test(prompt))
        return 'ocr';
    if (/\b(extract|read|transcribe)\b.{0,24}\b(visible\s+)?text\b/i.test(prompt))
        return 'ocr';
    if (/\bvisible\s+text\b/i.test(prompt))
        return 'ocr';
    return 'general';
}
//# sourceMappingURL=infer-vision-mode.js.map