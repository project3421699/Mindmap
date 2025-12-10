
import { Component, ElementRef, effect, input, viewChild, HostListener, signal, OnDestroy } from '@angular/core';
import { MindMapNode } from '../services/markdown-parser.service';
import { jsPDF } from 'jspdf';
import * as d3 from 'd3';

@Component({
  selector: 'app-viewer',
  host: {
    'class': 'block w-full h-full overflow-hidden'
  },
  template: `
    <div class="w-full h-full bg-slate-950 relative overflow-hidden select-none group">
      <div #svgContainer class="w-full h-full cursor-grab active:cursor-grabbing"></div>
      
      @if (!data()) {
        <div class="absolute inset-0 flex items-center justify-center text-slate-500 pointer-events-none">
          <p>No data to visualize</p>
        </div>
      }
      
      <!-- Controls -->
      <div class="absolute bottom-6 right-6 flex gap-2 opacity-100 transition-opacity z-10">
         <button 
           (click)="resetZoom()" 
           class="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 transition-all shadow-lg active:scale-95"
           title="Reset View"
         >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            Reset
         </button>

         <button 
           (click)="downloadPdf()" 
           [disabled]="isExporting()"
           class="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium border border-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
         >
            @if (isExporting()) {
               <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            } @else {
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            }
            {{ isExporting() ? 'Exporting...' : 'Download PDF' }}
         </button>
      </div>
    </div>
  `
})
export class ViewerComponent implements OnDestroy {
  data = input<MindMapNode>();
  svgContainer = viewChild<ElementRef>('svgContainer');
  isExporting = signal(false);

  private svg: any;
  private g: any;
  private zoom: any;
  private allNodes: any[] = [];
  private resizeObserver: ResizeObserver | null = null;
  
  // Configuration
  private readonly MAX_LINE_CHARS = 24; 
  private readonly LINE_HEIGHT = 20;
  private readonly NODE_PADDING_X = 28;
  private readonly NODE_PADDING_Y = 20;
  
  constructor() {
    effect(() => {
      const mindMapData = this.data();
      if (mindMapData && this.svgContainer()) {
        // Use setTimeout to ensure container has dimensions if just switched from hidden
        setTimeout(() => this.updateChart(mindMapData), 50);
      }
    });

    // Setup ResizeObserver to handle mobile tab switches and window resizes
    effect(() => {
      const el = this.svgContainer()?.nativeElement;
      if (el) {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        
        this.resizeObserver = new ResizeObserver(() => {
           if (this.data()) {
             // Debounce slightly if needed
             requestAnimationFrame(() => this.updateChart(this.data()!));
           }
        });
        
        this.resizeObserver.observe(el);
      }
    });
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private wrapText(text: string): string[] {
    if (!text) return [''];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      if (currentLine.length + 1 + words[i].length <= this.MAX_LINE_CHARS) {
        currentLine += " " + words[i];
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
    return lines;
  }

  private processData(node: any) {
    const lines = this.wrapText(node.name || 'Untitled');
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const width = Math.max(140, (maxLineLen * 9) + this.NODE_PADDING_X * 2); 
    const height = (lines.length * this.LINE_HEIGHT) + this.NODE_PADDING_Y * 2;
    
    return {
      ...node,
      _lines: lines,
      _width: width,
      _height: height
    };
  }
  
  private mapData(node: any): any {
    const processed = this.processData(node);
    if (node.children) {
      processed.children = node.children.map((c: any) => this.mapData(c));
    }
    return processed;
  }

  private updateChart(rawData: MindMapNode) {
    const container = this.svgContainer()!.nativeElement;
    
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    try {
      d3.select(container).selectAll('*').remove();

      const width = container.clientWidth;
      const height = container.clientHeight;

      // 1. Pre-process dimensions
      const processedRoot = this.mapData(rawData);

      // 2. Split Data (Balanced Left/Right)
      const rightChildren: any[] = [];
      const leftChildren: any[] = [];

      if (processedRoot.children) {
        processedRoot.children.forEach((child: any, i: number) => {
          if (i % 2 === 0) rightChildren.push(child);
          else leftChildren.push(child);
        });
      }

      // Important: Cloning logic to ensure D3 modifies unique objects
      const rightRoot = d3.hierarchy({ ...processedRoot, children: rightChildren });
      const leftRoot = d3.hierarchy({ ...processedRoot, children: leftChildren });

      // 3. Layout Configuration
      const dx = 220; 
      const dy = 350; 

      const tree = d3.tree()
        .nodeSize([dx, dy])
        .separation((a: any, b: any) => {
            return a.parent === b.parent ? 1.1 : 2.5; 
        });

      tree(rightRoot);
      tree(leftRoot);

      // Invert left side (horizontal flip of y-coordinate which represents x-axis in our visual map)
      leftRoot.descendants().forEach((d: any) => {
        d.y = -d.y;
      });

      // Merge nodes - skip root of left side to avoid duplicate
      const nodes = rightRoot.descendants().concat(leftRoot.descendants().slice(1));
      const links = rightRoot.links().concat(leftRoot.links());
      
      this.allNodes = nodes;

      // 4. Drawing
      const colorScale = d3.scaleOrdinal()
          .range(["#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fbbf24", "#f87171"]);

      this.zoom = d3.zoom()
        .scaleExtent([0.05, 4])
        .on('zoom', (event: any) => {
          this.g.attr('transform', event.transform);
        });

      this.svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', [0, 0, width, height])
        .call(this.zoom)
        .on("dblclick.zoom", null);

      this.svg.append("rect")
          .attr("width", width)
          .attr("height", height)
          .style("fill", "none")
          .style("pointer-events", "all");

      this.g = this.svg.append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

      // Draw Links
      this.g.selectAll('.link')
        .data(links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', '#475569')
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.5)
        .attr('d', d3.linkHorizontal()
            .x((d: any) => d.y)
            .y((d: any) => d.x)
        );

      // Draw Nodes
      const node = this.g.selectAll('.node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

      // Node Background
      node.append('rect')
        .attr('rx', 12)
        .attr('ry', 12)
        .attr('x', (d: any) => -d.data._width / 2) 
        .attr('y', (d: any) => -d.data._height / 2)
        .attr('width', (d: any) => d.data._width)
        .attr('height', (d: any) => d.data._height)
        .attr('fill', '#1e293b')
        .attr('stroke', (d: any) => colorScale(d.depth))
        .attr('stroke-width', 2)
        .style('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))');

      // Node Text
      const textGroup = node.append('text')
        .attr('text-anchor', 'middle')
        .style('font-family', 'ui-sans-serif, system-ui, sans-serif')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .style('fill', '#f1f5f9');

      textGroup.each(function(d: any) {
         const el = d3.select(this);
         const lines = d.data._lines;
         const lineHeight = 20;
         const totalTextHeight = lines.length * lineHeight;
         let startY = -(totalTextHeight / 2) + (lineHeight / 3); 

         lines.forEach((line: string, i: number) => {
           el.append('tspan')
             .attr('x', 0)
             .attr('dy', i === 0 ? startY + (lineHeight/2) : lineHeight)
             .text(line);
         });
      });

      // Only reset zoom on initial render or if explicitly requested
      if (!this.svg.node().__zoom) {
         this.resetZoom();
      }
    } catch (e) {
      console.error('D3 Rendering Error:', e);
    }
  }

  resetZoom() {
    if(!this.svg || !this.zoom) return;
    const container = this.svgContainer()!.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.svg.transition().duration(750).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85)
    );
  }

  async downloadPdf() {
    if (this.allNodes.length === 0 || this.isExporting()) return;
    this.isExporting.set(true);

    setTimeout(async () => {
      try {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        this.allNodes.forEach((d: any) => {
          const w = d.data._width;
          const h = d.data._height;
          
          const left = d.y - (w / 2);
          const right = d.y + (w / 2);
          const top = d.x - (h / 2);
          const bottom = d.x + (h / 2);

          if (left < minX) minX = left;
          if (right > maxX) maxX = right;
          if (top < minY) minY = top;
          if (bottom > maxY) maxY = bottom;
        });

        const padding = 100;
        const totalWidth = (maxX - minX) + (padding * 2);
        const totalHeight = (maxY - minY) + (padding * 2);

        const originalSvg = this.svg.node();
        const clonedSvg = originalSvg.cloneNode(true);
        
        clonedSvg.setAttribute('width', totalWidth);
        clonedSvg.setAttribute('height', totalHeight);
        clonedSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
        
        const rect = clonedSvg.querySelector('rect');
        if(rect) rect.remove();

        const g = clonedSvg.querySelector('g');
        g.setAttribute('transform', `translate(${-minX + padding}, ${-minY + padding})`);

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        
        const img = new Image();
        const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = 2; 
          canvas.width = totalWidth * scale;
          canvas.height = totalHeight * scale;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            this.isExporting.set(false);
            return;
          }

          ctx.fillStyle = '#0f172a'; // Match bg-slate-900
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          const imgData = canvas.toDataURL('image/jpeg', 1.0);
          
          const orientation = totalWidth > totalHeight ? 'l' : 'p';
          const pdf = new jsPDF({
            orientation: orientation,
            unit: 'px',
            format: [totalWidth, totalHeight] 
          });

          pdf.addImage(imgData, 'JPEG', 0, 0, totalWidth, totalHeight);
          pdf.save('mindmap.pdf');

          URL.revokeObjectURL(url);
          this.isExporting.set(false);
        };

        img.onerror = (e) => {
          console.error('SVG Load Error', e);
          this.isExporting.set(false);
        };

        img.src = url;

      } catch (err) {
        console.error('Export failed', err);
        this.isExporting.set(false);
      }
    }, 100);
  }
}
