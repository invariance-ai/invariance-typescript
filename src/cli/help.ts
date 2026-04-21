import type { Command } from 'commander';

/** Attach one or more example invocations to a command's --help output. */
export function withExamples(cmd: Command, examples: string[]): Command {
  const block = ['', 'Examples:', ...examples.map((e) => `  $ ${e}`)].join('\n');
  cmd.addHelpText('after', block);
  return cmd;
}

/** Decorate a subcommand group with a consistent trailing hint. */
export function withGroupHint(cmd: Command, hint: string): Command {
  cmd.addHelpText('after', `\n${hint}`);
  return cmd;
}
