// services/elevenlabs.js
// Genera audio MP3 tramite ElevenLabs TTS API

async function generateSpeech(text) {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim();

  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID mancanti");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability:        0.5,
          similarity_boost: 0.75,
          style:            0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${err}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

module.exports = { generateSpeech };
