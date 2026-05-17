import { GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import { logger } from "../logger.js";
import { ExtractionZ, GEMINI_RESPONSE_SCHEMA, emptyExtraction, type Extraction } from "./schema.js";
import { SYSTEM_PROMPT, USER_PROMPT_PHOTO, USER_PROMPT_VOICE, USER_PROMPT_PHOTO_PLUS_VOICE } from "./prompts.js";
import type { HealthRepo } from "../monitoring/repo.js";

const MODEL_NAME = "gemini-2.5-flash";
const log = logger.child({ module: "gemini" });

export type GeminiClient = {
  extractFromPhoto(image: { mimeType: string; buffer: Buffer }, transcript?: string): Promise<Extraction>;
  extractFromTranscript(transcript: string): Promise<Extraction>;
};

export function createGeminiClient(apiKey: string, healthRepo?: HealthRepo): GeminiClient {
  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA as unknown as Schema,
    },
  });

  async function generateAndParse(
    source: "photo" | "transcript",
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  ): Promise<Extraction> {
    const start = Date.now();
    try {
      const res = await model.generateContent({ contents: [{ role: "user", parts }] });
      const text = res.response.text();
      if (!text) return emptyExtraction();
      const json = JSON.parse(text);
      const parsed = ExtractionZ.safeParse(json);
      log.info({ source, durationMs: Date.now() - start }, "extraction complete");
      healthRepo?.upsert({
        serviceName: "gemini-extraction",
        lastRunAt: Date.now(),
        status: "ok",
        itemsProcessed: 1,
        itemsFailed: 0,
        lastError: null,
      });
      return parsed.success ? parsed.data : emptyExtraction();
    } catch (err) {
      log.error({ err, source, durationMs: Date.now() - start }, "extraction failed");
      healthRepo?.upsert({
        serviceName: "gemini-extraction",
        lastRunAt: Date.now(),
        status: "error",
        itemsProcessed: 0,
        itemsFailed: 1,
        lastError: String((err as Error).message ?? err).slice(0, 500),
      });
      throw err;
    }
  }

  return {
    async extractFromPhoto(image, transcript) {
      const userText = transcript ? USER_PROMPT_PHOTO_PLUS_VOICE(transcript) : USER_PROMPT_PHOTO;
      return generateAndParse("photo", [
        { inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } },
        { text: userText },
      ]);
    },
    async extractFromTranscript(transcript) {
      return generateAndParse("transcript", [{ text: USER_PROMPT_VOICE(transcript) }]);
    },
  };
}
