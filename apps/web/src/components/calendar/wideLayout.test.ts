// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';

describe('planning d’équipe grand écran', () => {
  // jsdom ne calcule pas la mise en page : on garde la règle qui provoquait le bug.
  it('le conteneur n’a ni transform ni filtre (sinon l’étiquette glissée n’est plus sous la souris)', () => {
    const planner = rule('.wide-planner');
    expect(planner).not.toBe('');
    expect(planner).not.toMatch(/(^|[\s;])(transform|filter|backdrop-filter|perspective|contain|will-change)\s*:/);
  });
});
