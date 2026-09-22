import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function workflow(name: string): string {
  return readFileSync(`.github/workflows/${name}`, 'utf8');
}

describe('PT-04 workflow serving path', () => {
  it.each([
    ['refresh-board.yml', '--dataset board'],
    ['refresh-market.yml', '--dataset market'],
  ])('%s exports and commits status after a failed attempt without swallowing failure', (name, dataset) => {
    const yaml = workflow(name);
    expect(yaml).toContain('continue-on-error: true');
    expect(yaml).toContain('if: always()');
    expect(yaml).toContain(dataset);
    expect(yaml).toContain('git add status.json');
    expect(yaml).toContain("steps.ingest.outcome == 'failure'");
    expect(yaml).toMatch(/Preserve refresh failure outcome[\s\S]*run: exit 1/);
    expect(yaml).toContain("if: always() && needs.");
  });

  it('market commits its regenerated status while leaving board ownership to the board workflow', () => {
    const yaml = workflow('refresh-market.yml');
    expect(yaml).toContain('git add status.json');
    expect(yaml).not.toContain('git add board.json');
  });

  it('serializes both status writers on one shared data-branch concurrency group', () => {
    expect(workflow('refresh-board.yml')).toContain('group: playerticker-site-data-refresh');
    expect(workflow('refresh-market.yml')).toContain('group: playerticker-site-data-refresh');
  });
});
