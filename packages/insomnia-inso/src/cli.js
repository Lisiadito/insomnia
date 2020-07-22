// @flow
import { ConversionTypeMap, generateConfig } from './commands/generate-config';
import { getVersion, logErrorExit1, exit, isDevelopment } from './util';
import { runInsomniaTests, TestReporterEnum } from './commands/run-tests';
import { lintSpecification } from './commands/lint-specification';
import { exportSpecification } from './commands/export-specification';
import { parseArgsStringToArgv } from 'string-argv';
import commander from 'commander';
import getOptions from './get-options';

type CreateCommandType = (command?: string, options?: Object) => Object;

function makeGenerateCommand(createCommand: CreateCommandType) {
  // inso generate
  const generate = createCommand('generate').description('Code generation utilities');

  const conversionTypes = Object.keys(ConversionTypeMap).join(', ');

  const defaultType = 'declarative';
  // inso generate config -t kubernetes config.yaml
  generate
    .command('config [identifier]')
    .description('Generate configuration from an api spec.')
    .option(
      '-t, --type <value>',
      `type of configuration to generate, options are [${conversionTypes}] (default: ${defaultType})`,
    )
    .option('-o, --output <path>', 'save the generated config to a file')
    .action((identifier, cmd) =>
      exit(generateConfig(identifier, getOptions(cmd, { type: defaultType }))),
    );

  return generate;
}

function makeTestCommand(createCommand: CreateCommandType) {
  // inso run
  const run = createCommand('run').description('Execution utilities');

  const reporterTypes = Object.keys(TestReporterEnum).join(', ');

  const defaultReporter = TestReporterEnum.spec;
  // inso run tests
  run
    .command('test [identifier]')
    .description('Run Insomnia unit test suites')
    .option('-e, --env <identifier>', 'environment to use')
    .option('-t, --testNamePattern <regex>', 'run tests that match the regex')
    .option(
      '-r, --reporter <reporter>',
      `reporter to use, options are [${reporterTypes}] (default: ${defaultReporter})`,
    )
    .option('-b, --bail', 'abort ("bail") after first test failure')
    .option('--keepFile', 'do not delete the generated test file')
    .action((identifier, cmd) =>
      exit(runInsomniaTests(identifier, getOptions(cmd, { reporter: defaultReporter }))),
    );

  return run;
}

function makeLintCommand(createCommand: CreateCommandType) {
  // inso lint
  const lint = createCommand('lint').description('Linting utilities');

  // inso lint spec
  lint
    .command('spec [identifier]')
    .description('Lint an API Specification')
    .action((identifier, cmd) => exit(lintSpecification(identifier, getOptions(cmd))));

  return lint;
}

function makeExportCommand(createCommand: CreateCommandType) {
  // inso export
  const exportCmd = createCommand('export').description('Export data from insomnia models');

  // inso export spec
  exportCmd
    .command('spec [identifier]')
    .description('Export an API Specification to a file')
    .option('-o, --output <path>', 'save the generated config to a file')
    .action((identifier, cmd) => exit(exportSpecification(identifier, getOptions(cmd))));

  return exportCmd;
}

function addScriptCommand(originalCommand: Object) {
  // inso script
  originalCommand
    .command('script <name>', { isDefault: true })
    .description('Run scripts defined in .insorc')
    .allowUnknownOption()
    .action((scriptName, cmd) => {
      // Load scripts
      const options = getOptions(cmd);

      // Ignore the first arg because that will be scriptName, get the rest
      const passThroughArgs = cmd.args.slice(1);

      // Find script
      const scriptTask = options.__configFile?.scripts?.[scriptName];

      if (!scriptTask) {
        console.log(`Could not find inso script "${scriptName}" in the config file.`);
        return exit(new Promise(resolve => resolve(false)));
      }

      // Collect args
      const scriptArgs: Array<string> = parseArgsStringToArgv(
        `${scriptTask} ${passThroughArgs.join(' ')}`,
      );

      // Print command
      console.log(`> > inso ${scriptArgs.join(' ')}`);

      // Run
      runWithArgs(originalCommand, scriptArgs, true);
    });
}

function makeDebugCommand(createCommand: CreateCommandType): Object {
  // inso export
  const debug = createCommand('debug').description('Debugging commands');

  // inso export spec
  debug
    .command('options')
    .description('Print all options parsed')
    .allowUnknownOption()
    .action(cmd => {
      const { __configFile, ...options } = getOptions(cmd);

      console.log(`loadOptions resolves to:\n${JSON.stringify(options, null, 2)}`);
      console.log(`cmd.args resolves to:\n${JSON.stringify(cmd.args)}`);

      return exit(
        new Promise<boolean>(resolve => resolve(false)),
      );
    });

  debug
    .command('config-file')
    .description('Load the config file')
    .action(cmd => {
      const options = getOptions(cmd);

      console.log(`Loaded config file:\n${JSON.stringify(options.__configFile || {}, null, 2)}`);
      return exit(
        new Promise<boolean>(resolve => resolve(false)),
      );
    });

  return debug;
}

export function go(args?: Array<string>, exitOverride?: boolean): void {
  const createCommand: CreateCommandType = (cmd?: string) => {
    const command = new commander.Command(cmd).storeOptionsAsProperties(false);

    if (exitOverride) {
      return command.exitOverride();
    }

    return command;
  };

  // inso
  const cmd = createCommand();

  // Version and description
  cmd.version(getVersion(), '-v, --version').description('A CLI for Insomnia!');

  // Global options
  cmd
    .option('-w, --workingDir <dir>', 'set working directory')
    .option('-a, --appDataDir <dir>', 'set the app data directory')
    .option('--config <path>', 'path to configuration file')
    .option('--ci', 'run in CI, disables all prompts');

  // Add commands and sub commands
  cmd
    .addCommand(makeGenerateCommand(createCommand))
    .addCommand(makeTestCommand(createCommand))
    .addCommand(makeLintCommand(createCommand))
    .addCommand(makeExportCommand(createCommand));

  // Add script base command
  addScriptCommand(cmd);

  // Debugging commands
  if (isDevelopment()) {
    cmd.addCommand(makeDebugCommand(createCommand));
  }

  runWithArgs(cmd, args || process.argv);
}

function runWithArgs(cmd: Object, args: Array<string>, userParametersOnly?: boolean) {
  cmd.parseAsync(args, userParametersOnly && { from: 'user' }).catch(logErrorExit1);
}
