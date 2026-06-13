import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/mp3'): Promise<string> {
  Logger.info(`Starting automatic Speech-to-Text transcription via Gemini Multimodal...`);
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Prepare the audio file block as inline base64 data for Gemini
    const audioPart = {
      inlineData: {
        data: audioBuffer.toString("base64"),
        mimeType: mimeType
      },
    };

    const result = await model.generateContent([
      "Please perform speech-to-text transcription on this meeting audio. Generate a clean transcript of the conversation with speaker indicators where possible.",
      audioPart
    ]);

    const transcript = result.response.text();
    Logger.info(`Speech-to-Text completed successfully. Transcript length: ${transcript.length} characters.`);
    return transcript;
  } catch (error) {
    Logger.error('Speech-to-Text transcription failed', error);
    throw error;
  }
}
