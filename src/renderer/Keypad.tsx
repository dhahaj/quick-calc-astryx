/** The optional on-screen keypad. Buttons never take focus, so typing keeps working. */

import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { useEffect, useRef } from 'react';

type Role = '' | 'op' | 'clear' | 'equals';

// [label, text to insert or action name, role]
const KEYS: ReadonlyArray<ReadonlyArray<readonly [string, string, Role]>> = [
  [['C', '<clear>', 'clear'], ['(', '(', 'op'], [')', ')', 'op'], ['⌫', '<back>', 'op'], ['÷', '/', 'op']],
  [['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['√', 'sqrt(', 'op'], ['×', '*', 'op']],
  [['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['^', '^', 'op'], ['−', '-', 'op']],
  [['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['π', 'pi', 'op'], ['+', '+', 'op']],
  [['0', '0', ''], ['.', '.', ''], ['%', '%', 'op'], ['ans', 'ans', 'op'], ['=', '<equals>', 'equals']],
];

const NAMES: Readonly<Record<string, string>> = {
  C: 'Clear', '⌫': 'Backspace', '÷': 'Divide', '√': 'Square root', '×': 'Multiply', '^': 'Power',
  '−': 'Subtract', π: 'Pi', '+': 'Add', '%': 'Percent', ans: 'Previous answer', '=': 'Equals',
};

// Qt's auto-repeat timing for the backspace key.
const REPEAT_DELAY = 300;
const REPEAT_INTERVAL = 100;

export interface KeypadProps {
  onInsert(text: string): void;
  onClear(): void;
  onBackspace(): void;
  onEquals(): void;
}

export function Keypad({ onInsert, onClear, onBackspace, onEquals }: KeypadProps) {
  const repeat = useRef<{ delay?: number; interval?: number }>({});
  const stopRepeat = () => {
    window.clearTimeout(repeat.current.delay);
    window.clearInterval(repeat.current.interval);
    repeat.current = {};
  };
  useEffect(() => stopRepeat, []);

  const press = (action: string) => {
    if (action === '<clear>') onClear();
    else if (action === '<equals>') onEquals();
    else if (action !== '<back>') onInsert(action);
  };

  const startBackspace = () => {
    stopRepeat();
    onBackspace();
    repeat.current.delay = window.setTimeout(() => {
      repeat.current.interval = window.setInterval(onBackspace, REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  };

  return (
    // preventDefault on mousedown keeps the keyboard focus in the input line.
    <div className="qc-keypad" onMouseDown={(e) => e.preventDefault()}>
      <Grid columns={5} gap={1}>
        {KEYS.flat().map(([label, action, role]) => (
          <Button
            key={label}
            label={NAMES[label] ?? label}
            variant={role === 'equals' ? 'primary' : 'secondary'}
            className="qc-key"
            data-role={role}
            tabIndex={-1}
            width="100%"
            onClick={action === '<back>' ? undefined : () => press(action)}
            onPointerDown={action === '<back>' ? startBackspace : undefined}
            onPointerUp={action === '<back>' ? stopRepeat : undefined}
            onPointerLeave={action === '<back>' ? stopRepeat : undefined}
            onPointerCancel={action === '<back>' ? stopRepeat : undefined}
          >
            {label}
          </Button>
        ))}
      </Grid>
    </div>
  );
}
