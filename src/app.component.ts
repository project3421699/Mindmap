
import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MarkdownParserService } from './services/markdown-parser.service';
import { GeminiService } from './services/gemini.service';
import { ViewerComponent } from './components/viewer.component';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, ViewerComponent],
  template: `
    <div class="flex flex-col md:flex-row h-screen w-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      <!-- Mobile Tab Navigation (Visible only on mobile) -->
      <div class="md:hidden flex h-12 bg-slate-900 border-b border-slate-800 shrink-0 z-20 shadow-md">
        <button 
          (click)="setMobileTab('editor')" 
          class="flex-1 text-sm font-medium transition-colors border-b-2"
          [class.border-blue-500]="mobileTab() === 'editor'"
          [class.text-blue-400]="mobileTab() === 'editor'"
          [class.border-transparent]="mobileTab() !== 'editor'"
          [class.text-slate-400]="mobileTab() !== 'editor'"
        >
          Editor
        </button>
        <button 
          (click)="setMobileTab('map')" 
          class="flex-1 text-sm font-medium transition-colors border-b-2"
          [class.border-blue-500]="mobileTab() === 'map'"
          [class.text-blue-400]="mobileTab() === 'map'"
          [class.border-transparent]="mobileTab() !== 'map'"
          [class.text-slate-400]="mobileTab() !== 'map'"
        >
          Preview Map
        </button>
      </div>

      <!-- Left Sidebar: Editor & Controls -->
      <!-- On mobile: Hidden if map tab is active. On desktop: Always flex. -->
      <div 
        class="flex-col md:flex md:w-96 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900 shadow-xl z-10 shrink-0 h-full md:h-full w-full"
        [class.hidden]="mobileTab() === 'map'"
        [class.flex]="mobileTab() === 'editor'"
      >
        <!-- Header -->
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <h1 class="text-lg font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            MindMap AI
          </h1>
          <div class="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-400">
            v1.0
          </div>
        </div>

        <!-- AI Generator Section -->
        <div class="p-4 border-b border-slate-800 space-y-3 bg-slate-900/50">
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Generate with AI
          </label>
          <div class="flex gap-2">
            <input 
              [formControl]="topicControl" 
              (keydown.enter)="generateMap()"
              placeholder="Topic (e.g., 'React vs Angular')..." 
              class="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-slate-600"
            />
            <button 
              (click)="generateMap()" 
              [disabled]="isGenerating()"
              class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded transition-colors flex items-center justify-center min-w-[40px]"
            >
              @if (isGenerating()) {
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              }
            </button>
          </div>
          @if (errorMessage()) {
            <p class="text-xs text-red-400">{{ errorMessage() }}</p>
          }
        </div>

        <!-- Markdown Editor -->
        <div class="flex-1 flex flex-col min-h-0">
          <div class="px-4 py-2 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Markdown Editor</span>
            <div class="flex gap-3">
              <button 
                (click)="copyToClipboard()" 
                class="text-xs transition-colors"
                [class.text-green-400]="isCopied()"
                [class.text-blue-400]="!isCopied()"
                [class.hover:text-blue-300]="!isCopied()"
              >
                {{ isCopied() ? 'Copied!' : 'Copy' }}
              </button>
              <button (click)="clearEditor()" class="text-xs text-slate-500 hover:text-slate-300 transition-colors">Clear</button>
            </div>
          </div>
          <textarea 
            [formControl]="markdownControl"
            class="flex-1 w-full bg-slate-950 p-4 font-mono text-sm text-slate-300 resize-none focus:outline-none leading-relaxed"
            spellcheck="false"
          ></textarea>
        </div>
        
        <!-- Footer Info -->
        <div class="p-3 text-center text-[10px] text-slate-600 border-t border-slate-800">
          Use indentation (spaces or tabs) to create hierarchy.
        </div>
      </div>

      <!-- Right Main: Viewer -->
      <!-- On mobile: Hidden if editor tab is active. On desktop: Always flex. -->
      <div 
        class="md:flex flex-1 relative bg-slate-950 h-full w-full"
        [class.hidden]="mobileTab() === 'editor'"
        [class.flex]="mobileTab() === 'map'"
      >
        <!-- Dot pattern background -->
        <div class="absolute inset-0 opacity-[0.03]" style="background-image: radial-gradient(#94a3b8 1px, transparent 1px); background-size: 24px 24px;"></div>
        
        <app-viewer [data]="parsedData()"></app-viewer>
      </div>
    </div>
  `
})
export class AppComponent {
  private parser = inject(MarkdownParserService);
  private gemini = inject(GeminiService);

  // State for Mobile Navigation
  readonly mobileTab = signal<string>('editor');

  topicControl = new FormControl('', { nonNullable: true });
  markdownControl = new FormControl(
`- Mind Map AI
  - Features
    - Markdown Input
    - AI Generation
    - D3 Visualization
  - Tech Stack
    - Angular
    - Tailwind
    - D3.js`, 
    { nonNullable: true }
  );

  isGenerating = signal(false);
  errorMessage = signal<string | null>(null);
  isCopied = signal(false);

  // Computed state for the viewer
  parsedData = computed(() => {
    // We update this signal manually on subscription to ensure sync
    return this.parser.parse(this.currentMarkdown());
  });

  currentMarkdown = signal(this.markdownControl.value);

  constructor() {
    // Sync form control to signal
    this.markdownControl.valueChanges.subscribe(val => {
      this.currentMarkdown.set(val);
    });
  }

  setMobileTab(tab: string) {
    this.mobileTab.set(tab);
  }

  async generateMap() {
    const topic = this.topicControl.value.trim();
    if (!topic) return;

    this.isGenerating.set(true);
    this.errorMessage.set(null);

    try {
      const generatedMarkdown = await this.gemini.generateMindMapMarkdown(topic);
      this.markdownControl.setValue(generatedMarkdown);
      
      // Auto-switch to map view on mobile after generation
      if (window.innerWidth < 768) {
        this.setMobileTab('map');
      }
    } catch (err) {
      this.errorMessage.set('Failed to generate. Check API Key.');
      console.error(err);
    } finally {
      this.isGenerating.set(false);
    }
  }

  copyToClipboard() {
    const val = this.markdownControl.value;
    navigator.clipboard.writeText(val).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }

  clearEditor() {
    this.markdownControl.setValue('');
  }
}
