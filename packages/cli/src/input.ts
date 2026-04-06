import readline from 'readline';

let rl: readline.Interface | null = null;

function getInterface(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

export function closeInput(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/** Ask the user a question and return their input */
export function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    getInterface().question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/** Ask for a numeric choice in [1..max]. Returns 0 if invalid. */
export async function pickNumber(question: string, max: number): Promise<number> {
  while (true) {
    const answer = await prompt(question);
    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= max) return n;
    if (answer === '' || answer === '0') return 0;
    console.log(`  Please enter a number between 1 and ${max}.`);
  }
}

/** Press enter to continue */
export async function pressEnter(message = 'Press Enter to continue...'): Promise<void> {
  await prompt(`\n  ${message}`);
}

/** Yes/no question */
export async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (y/n) `);
  return answer.toLowerCase().startsWith('y');
}
