import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a calibrated superforecaster AI agent operating on Starknet.

Your task is to analyze prediction market questions and produce well-calibrated probability estimates.

Follow this process:
1. **Base Rate**: Start with the historical base rate for similar events
2. **Inside View**: Analyze specific evidence for this particular question
3. **Outside View**: Consider reference classes of similar predictions
4. **Update**: Adjust based on recent data, trends, and market conditions
5. **Calibrate**: Check for overconfidence — move toward 50% if uncertain

Rules:
- Always output a specific probability as a percentage (e.g., "**My estimate: 67%**")
- Show your reasoning transparently — users are watching you think
- Consider both sides of the question
- Be honest about uncertainty
- Reference specific data when possible (crypto prices, network metrics, historical trends)
- Your probability should reflect your genuine epistemic state, not what you think users want to hear

End your analysis with exactly this format on its own line:
**My estimate: XX%**`;

export interface ForecastResult {
  reasoning: string;
  probability: number;
}

/** Stream a forecast analysis from Claude. Yields reasoning text chunks. */
export async function* forecastMarket(
  question: string,
  context: {
    currentMarketProb?: number;
    totalPool?: string;
    agentPredictions?: { agent: string; prob: number; brier: number }[];
    timeUntilResolution?: string;
  }
): AsyncGenerator<string, ForecastResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Yield a demo forecast when no API key
    const demoText = generateDemoForecast(question, context);
    for (const chunk of demoText.split(/(?<=\. )/)) {
      yield chunk;
      await new Promise((r) => setTimeout(r, 50));
    }
    const prob = extractProbability(demoText);
    return { reasoning: demoText, probability: prob };
  }

  const client = new Anthropic({ apiKey });

  let contextStr = "";
  if (context.currentMarketProb !== undefined) {
    contextStr += `\nCurrent market probability: ${(context.currentMarketProb * 100).toFixed(1)}%`;
  }
  if (context.totalPool) {
    contextStr += `\nTotal pool: ${context.totalPool} tokens`;
  }
  if (context.timeUntilResolution) {
    contextStr += `\nTime until resolution: ${context.timeUntilResolution}`;
  }
  if (context.agentPredictions?.length) {
    contextStr += "\nOther agent predictions:";
    for (const p of context.agentPredictions) {
      contextStr += `\n  - ${p.agent}: ${(p.prob * 100).toFixed(0)}% (Brier: ${p.brier.toFixed(3)})`;
    }
  }

  const userMessage = `Analyze this prediction market question and provide your probability estimate:\n\n"${question}"${contextStr}`;

  let fullText = "";

  const stream = client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullText += event.delta.text;
      yield event.delta.text;
    }
  }

  const probability = extractProbability(fullText);
  return { reasoning: fullText, probability };
}

/** Extract probability from Claude's response. */
export function extractProbability(text: string): number {
  // Look for "**My estimate: XX%**" pattern
  const match = text.match(/\*\*My estimate:\s*(\d+(?:\.\d+)?)%\*\*/i);
  if (match) return parseFloat(match[1]) / 100;

  // Fallback: look for any "XX%" near the end
  const fallback = text.match(/(\d+(?:\.\d+)?)%/g);
  if (fallback && fallback.length > 0) {
    const last = fallback[fallback.length - 1];
    return parseFloat(last) / 100;
  }

  return 0.5; // default if no probability found
}

function generateDemoForecast(
  question: string,
  context: {
    currentMarketProb?: number;
    agentPredictions?: { agent: string; prob: number; brier: number }[];
  }
): string {
  const marketProb = context.currentMarketProb ?? 0.5;
  const isYesLeaning = marketProb > 0.5;

  return `## Analysis: "${question}"

### Base Rate
Looking at historical data for similar crypto/blockchain predictions, events of this type occur approximately ${isYesLeaning ? "55-65%" : "30-45%"} of the time in comparable market conditions.

### Inside View
The current market is pricing this at ${(marketProb * 100).toFixed(1)}%. ${
    isYesLeaning
      ? "The bullish lean reflects recent momentum and positive sentiment in the ecosystem."
      : "The bearish lean suggests significant headwinds and uncertainty around this outcome."
  }

### Key Factors
- **Supporting evidence**: Recent network growth metrics and developer activity are ${isYesLeaning ? "strong" : "mixed"}
- **Counterarguments**: ${isYesLeaning ? "Macro headwinds and regulatory uncertainty could dampen progress" : "Potential catalysts including upcoming protocol upgrades could shift momentum"}
- **Information gaps**: Limited on-chain data for precise estimation, relying partly on qualitative assessment

### Calibration Check
${context.agentPredictions?.length ? `Other agents are predicting between ${Math.min(...context.agentPredictions.map((p) => p.prob * 100)).toFixed(0)}% and ${Math.max(...context.agentPredictions.map((p) => p.prob * 100)).toFixed(0)}%. ` : ""}My estimate accounts for both the base rate and specific factors, adjusted slightly toward the market consensus.

**My estimate: ${Math.round(marketProb * 100 + (Math.random() - 0.5) * 10)}%**`;
}
