/**
 * Cleans up and simplifies complex error messages from the Google/Gemini APIs,
 * making them user-friendly and short enough to be stored in Google Drive appProperties.
 */
export function cleanErrorMessage(err: any): string {
  if (!err) return "Unbekannter Fehler";
  const msg = typeof err === "string" ? err : String(err.message ?? err);

  // Gemini API specific quota errors
  if (
    msg.includes("429") ||
    msg.includes("Quota exceeded") ||
    msg.includes("quotaMetric") ||
    msg.includes("rate-limits") ||
    msg.includes("GenerateRequestsPerDayPerProjectPerModel")
  ) {
    return "Gemini-Limit überschritten (429 Too Many Requests). Bitte in Kürze erneut versuchen.";
  }

  // Gemini API key errors
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
    return "Ungültiger Gemini API-Key. Bitte überprüfe deine Einstellungen.";
  }

  // Network timeouts or fetch errors
  if (
    msg.includes("socket hang up") ||
    msg.includes("timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("ETIMEDOUT")
  ) {
    return "Netzwerkfehler / Zeitüberschreitung bei der Gemini-Verbindung. Bitte erneut versuchen.";
  }

  // Clean up typical long GoogleGenerativeAI error prefix
  if (msg.includes("[GoogleGenerativeAI Error]:")) {
    // Extract the core message after the prefix, before the long JSON string
    const match = msg.match(/\[GoogleGenerativeAI Error\]:\s*(.*?)(?:\s*\n|\s*\[|\s*\{|$)/);
    if (match && match[1]) {
      const core = match[1].trim();
      return core.length > 120 ? core.slice(0, 117) + "..." : core;
    }
  }

  // General fallbacks (slice to fit in appProperties nicely)
  return msg.length > 120 ? msg.slice(0, 117) + "..." : msg;
}
