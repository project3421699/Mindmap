
import { Component, ElementRef, effect, input, viewChild, HostListener, signal } from '@angular/core';
import { MindMapNode } from '../services/markdown-parser.service';
import { jsPDF } from 'jspdf';

declare const d3: any;

@Component({
  selector: 'app-viewer',
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
export class ViewerComponent {
  data = input<MindMapNode>();
  svgContainer = viewChild<ElementRef>('svgContainer');
  isExporting = signal(false);

  private svg: any;
  private g: any;
  private zoom: any;
  private allNodes: any[] = []; 
  
  // Configuration
  private readonly MAX_LINE_CHARS = 20; // Slightly tighter wrapping
  private readonly LINE_HEIGHT = 18;
  private readonly NODE_PADDING_X = 24;
  private readonly NODE_PADDING_Y = 16;
  
  constructor() {
    effect(() => {
      const mindMapData = this.data();
      if (mindMapData && this.svgContainer()) {
        this.updateChart(mindMapData);
      }
    });
  }

  private wrapText(text: string): string[] {
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

  // Pre-calculate size for each node
  private processData(node: any) {
    const lines = this.wrapText(node.name);
    // Estimate width: simplified char width average (e.g. 8px per char)
    // Max width limited by wrapping, but we want the actual box to fit the longest line
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const width = Math.max(120, (maxLineLen * 8) + this.NODE_PADDING_X * 2); 
    const height = (lines.length * this.LINE_HEIGHT) + this.NODE_PADDING_Y * 2;
    
    return {
      ...node,
      _lines: lines,
      _width: width,
      _height: height
    };
  }
  
  // Recursive map to process entire tree
  private mapData(node: any): any {
    const processed = this.processData(node);
    if (node.children) {
      processed.children = node.children.map((c: any) => this.mapData(c));
    }
    return processed;
  }

  private updateChart(rawData: MindMapNode) {
    const container = this.svgContainer()!.nativeElement;
    d3.select(container).selectAll('*').remove();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Pre-process data for dimensions
    const processedRoot = this.mapData(rawData);

    // 2. Split Data (Left/Right)
    const rightChildren: any[] = [];
    const leftChildren: any[] = [];

    if (processedRoot.children) {
      processedRoot.children.forEach((child: any, i: number) => {
        if (i % 2 === 0) rightChildren.push(child);
        else leftChildren.push(child);
      });
    }

    const rightRoot = d3.hierarchy({ ...processedRoot, children: rightChildren });
    const leftRoot = d3.hierarchy({ ...processedRoot, children: leftChildren });

    // 3. Layout Configuration
    // dx: Vertical spacing between nodes (Increased significantly to prevent overlapping pink nodes)
    // dy: Horizontal spacing between levels
    const dx = 200; 
    const dy = 320; 

    // Create tree layout with custom separation
    const tree = d3.tree()
      .nodeSize([dx, dy])
      .separation((a: any, b: any) => {
          // Add extra space between cousins to prevent sub-tree overlap
          return a.parent === b.parent ? 1 : 1.4;
      });

    tree(rightRoot);
    tree(leftRoot);

    // Invert left side horizontal coordinate
    leftRoot.descendants().forEach((d: any) => {
      d.y = -d.y;
    });

    // Merge nodes
    const nodes = rightRoot.descendants().concat(leftRoot.descendants().slice(1));
    const links = rightRoot.links().concat(leftRoot.links());
    
    this.allNodes = nodes;

    // 4. Drawing
    const colorScale = d3.scaleOrdinal()
        .range(["#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fbbf24", "#f87171"]);

    this.zoom = d3.zoom()
      .scaleExtent([0.1, 3])
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

    // Add a rect to catch zoom events on empty space
    this.svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all");

    this.g = this.svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Links
    this.g.selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#475569')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6)
      .attr('d', d3.linkHorizontal()
          .x((d: any) => d.y)
          .y((d: any) => d.x)
      );

    // Nodes
    const node = this.g.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

    // Node Background Rects
    node.append('rect')
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('x', (d: any) => -d.data._width / 2) // Center horizontally
      .attr('y', (d: any) => -d.data._height / 2) // Center vertically
      .attr('width', (d: any) => d.data._width)
      .attr('height', (d: any) => d.data._height)
      .attr('fill', '#1e293b')
      .attr('stroke', (d: any) => colorScale(d.depth))
      .attr('stroke-width', 2);

    // Node Text (Multi-line)
    const textGroup = node.append('text')
      .attr('text-anchor', 'middle')
      .style('font-family', 'sans-serif')
      .style('font-size', '14px')
      .style('font-weight', '500')
      .style('fill', '#e2e8f0');

    textGroup.each(function(d: any) {
       const el = d3.select(this);
       const lines = d.data._lines;
       // Calculate starting y to center the block of text vertically
       const totalTextHeight = lines.length * 18; // approx line height
       let startY = -(totalTextHeight / 2) + 5; // +5 for baseline adjustment

       lines.forEach((line: string, i: number) => {
         el.append('tspan')
           .attr('x', 0)
           .attr('dy', i === 0 ? startY + 9 : 18) // First line absolute, others relative
           .text(line);
       });
    });

    this.resetZoom();
  }

  resetZoom() {
    if(!this.svg || !this.zoom) return;
    const container = this.svgContainer()!.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.svg.transition().duration(750).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)
    );
  }

  async downloadPdf() {
    if (this.allNodes.length === 0 || this.isExporting()) return;
    this.isExporting.set(true);

    setTimeout(async () => {
      try {
        // 1. Calculate Bounding Box
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

        const padding = 80;
        const totalWidth = (maxX - minX) + (padding * 2);
        const totalHeight = (maxY - minY) + (padding * 2);

        // 2. Clone SVG
        const originalSvg = this.svg.node();
        const clonedSvg = originalSvg.cloneNode(true);
        
        clonedSvg.setAttribute('width', totalWidth);
        clonedSvg.setAttribute('height', totalHeight);
        clonedSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
        
        // Remove the background rect we added for zooming
        const rect = clonedSvg.querySelector('rect');
        if(rect) rect.remove();

        const g = clonedSvg.querySelector('g');
        g.setAttribute('transform', `translate(${-minX + padding}, ${-minY + padding})`);

        // 3. Serialize & Rasterize
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

          // Dark Background for PDF
          ctx.fillStyle = '#020617';
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
