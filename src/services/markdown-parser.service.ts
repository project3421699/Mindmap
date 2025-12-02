import { Injectable } from '@angular/core';

export interface MindMapNode {
  name: string;
  children?: MindMapNode[];
  id?: string;
  depth?: number;
}

@Injectable({
  providedIn: 'root'
})
export class MarkdownParserService {

  parse(markdown: string): MindMapNode {
    // Normalize tabs to 2 spaces
    const normalizedMarkdown = markdown.replace(/\t/g, '  ');
    const lines = normalizedMarkdown.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return { name: 'Empty Map', children: [] };
    }

    // Virtual root to handle parsing state
    const virtualRoot: MindMapNode = { name: 'root', children: [], depth: -1 };
    const stack: { node: MindMapNode; level: number }[] = [];
    stack.push({ node: virtualRoot, level: -1 });

    for (const line of lines) {
      // Calculate indentation (number of spaces at start)
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      
      // Clean content
      let content = line.trim();
      // Remove common list markers
      content = content.replace(/^[-*+]\s+/, ''); 
      // Remove header markers
      content = content.replace(/^#+\s+/, '');

      const newNode: MindMapNode = { name: content, children: [] };

      // Find appropriate parent based on indentation level
      while (stack.length > 1 && stack[stack.length - 1].level >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(newNode);

      stack.push({ node: newNode, level: indent });
    }

    // Logic to determine the real root:
    
    // 1. If nothing parsed, return fallback
    if (!virtualRoot.children || virtualRoot.children.length === 0) {
       return { name: 'Start Typing...', children: [] };
    }

    // 2. If exactly one top-level item, that is the root.
    if (virtualRoot.children.length === 1) {
      return virtualRoot.children[0];
    }
    
    // 3. If multiple top-level items, assume the FIRST one is the Main Topic (Root)
    // and the rest are its direct children.
    const realRoot = virtualRoot.children[0];
    const siblings = virtualRoot.children.slice(1);
    
    if (!realRoot.children) {
      realRoot.children = [];
    }
    
    // Append siblings to the first node's children
    realRoot.children = [...realRoot.children, ...siblings];

    return realRoot;
  }
}