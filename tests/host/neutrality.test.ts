import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '../../src/host/index';

/** Files that make up the shipped plugin halves. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments so a scan only sees executable text. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//');
      if (index < 0) return line;
      const before = line.slice(0, index);
      const quotes = (before.match(/["'`]/g) ?? []).length;
      return quotes % 2 === 0 ? before : line;
    })
    .join('\n');
}

/** A context that records every service name the plugin touches. */
function instrumentedContext() {
  const reads: string[] = [];
  const registered: Array<{ name: string; description: string }> = [];
  const injections: string[][] = [];
  const effects: string[] = [];
  const base = {
    tools: {
      register(definition: { name: string; description: string }) {
        registered.push({ name: definition.name, description: definition.description });
        return () => {};
      }
    },
    effect(execute: () => () => void, label?: string) {
      effects.push(label ?? '');
      const dispose = execute();
      return () => dispose();
    },
    inject(names: string[], callback: (sub: unknown) => unknown) {
      injections.push([...names]);
      void callback;
      return () => {};
    }
  };
  const ctx = new Proxy(base, {
    get(target, property, receiver) {
      if (typeof property === 'string') reads.push(property);
      return Reflect.get(target, property, receiver);
    }
  });
  return { ctx, reads, registered, injections, effects };
}

const FORBIDDEN_SERVICE = ['systemPrompt', 'persona', 'skill', 'agentPreset', 'instructions', 'commands', 'prompt'];

describe('prompt neutrality of the host half', () => {
  it('never touches prompt or persona services and registers only technical tools', () => {
    const { ctx, reads, registered, injections, effects } = instrumentedContext();
    const dispose = apply(ctx as never, {});
    expect(registered.map((tool) => tool.name)).toEqual(['rich_msg_validate', 'rich_msg_publish']);
    for (const reading of reads) {
      for (const forbidden of FORBIDDEN_SERVICE) {
        expect(reading.toLowerCase().includes(forbidden.toLowerCase())).toBe(false);
      }
    }
    expect(injections.every((names) => names.length === 1 && names[0] === 'webServer')).toBe(true);
    expect(effects.some((label) => label.includes('host resources'))).toBe(true);
    dispose();
  });

  it('registers no tool when tool registration is disabled', () => {
    const { ctx, registered } = instrumentedContext();
    apply(ctx as never, { tools: false, httpRoute: false });
    expect(registered).toHaveLength(0);
  });

  it('contains no executable prompt or persona injection in shipped sources', () => {
    const files = sourceFiles(join(process.cwd(), 'src'));
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes('/core/schema.ts') || file.includes('/ui/')) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/systemPrompt/.test(code)) offenders.push(file + ': systemPrompt');
      if (/\.section\s*\(/.test(code)) offenders.push(file + ': .section(');
      if (/\bdefinePersona\b|\.persona\s*\(|role:\s*['"]system['"]/.test(code)) offenders.push(file + ': persona');
      if (/\bregisterSkill\b|skillDefinition|prompt\.md|readFileSync\([^)]*prompt/.test(code)) offenders.push(file + ': skill');
    }
    expect(offenders).toEqual([]);
  });

  it('ships no runtime prompt file and never reads one', () => {
    const host = stripComments(readFileSync(join(process.cwd(), 'src/host/index.ts'), 'utf8'));
    expect(host.includes('prompt-rich-ui')).toBe(false);
    expect(host.includes('readFileSync')).toBe(false);
  });
});
