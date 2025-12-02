import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async generateMindMapMarkdown(topic: string): Promise<string> {
    if (!process.env.API_KEY) {
      throw new Error('API Key not found');
    }

    const prompt = `
      You are an expert mind map creator. 
      Create a detailed hierarchical mind map about the topic: "${topic}".
      
      Output Rules:
      1. Format strict Markdown list using hyphens (-).
      2. Indentation must be exactly 2 spaces per level.
      3. No bold, italics, code blocks, or introductory text. 
      4. Start directly with the root topic as "- Topic Name".
      5. Limit depth to 3-4 levels.
      6. Provide 15-25 nodes total.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      // Clean up response if it includes markdown code blocks
      let text = response.text.trim();
      text = text.replace(/^```markdown\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
      
      return text.trim();
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
  }
}
