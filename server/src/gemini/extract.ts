import { GoogleGenerativeAI, type Schema } from "@google/generative-ai";
import { logger } from "../logger.js";
import { ExtractionZ, GEMINI_RESPONSE_SCHEMA, emptyExtraction, type Extraction, ReceiptPositionsZ, GEMINI_POSITIONS_SCHEMA, type ReceiptPositions } from "./schema.js";
import { SYSTEM_PROMPT, USER_PROMPT_PHOTO, USER_PROMPT_VOICE, USER_PROMPT_PHOTO_PLUS_VOICE } from "./prompts.js";
import type { HealthRepo } from "../monitoring/repo.js";

const MODEL_NAME = "gemini-3.1-flash-lite";
const log = logger.child({ module: "gemini" });

export type GeminiClient = {
  extractFromPhoto(image: { mimeType: string; buffer: Buffer }, transcript?: string): Promise<Extraction>;
  extractFromTranscript(transcript: string): Promise<Extraction>;
  extractPositions(image: { mimeType: string; buffer: Buffer }): Promise<ReceiptPositions>;
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
    async extractPositions(image) {
      const start = Date.now();
      try {
        const pModel = ai.getGenerativeModel({
          model: MODEL_NAME,
          systemInstruction: "You are an expert OCR and financial parser. Extract all individual line items (positions) from the receipt document. For each item, return a clean name/description and its exact price/amount. Also return the total receipt amount.",
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_POSITIONS_SCHEMA as unknown as Schema,
          },
        });

        const res = await pModel.generateContent({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } },
              { text: "Extract all line items (name and amount) and the total amount from this receipt in JSON format." },
            ]
          }]
        });

        const text = res.response.text();
        if (!text) return { items: [], total: 0 };
        const json = JSON.parse(text);
        const parsed = ReceiptPositionsZ.safeParse(json);
        log.info({ durationMs: Date.now() - start }, "positions extraction complete");
        healthRepo?.upsert({
          serviceName: "gemini-extraction",
          lastRunAt: Date.now(),
          status: "ok",
          itemsProcessed: 1,
          itemsFailed: 0,
          lastError: null,
        });
        return parsed.success ? parsed.data : { items: [], total: 0 };
      } catch (err) {
        log.error({ err, durationMs: Date.now() - start }, "positions extraction failed");
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
    },
  };
}
