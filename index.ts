#!/usr/bin/env bun

import fs from "fs";
import os from "os";
import path from "path";

// @ts-expect-error no ts definitions for yare-sync
import sync from "yare-sync";

import { Command } from "commander";
import ora, { type Ora } from "ora";
import { createPrompt, createSelection } from "bun-promptx";
import chalk from "chalk";

const SESSION_FILE_PATH = path.join(os.tmpdir(), "yare-sync-last-session.json");

type Session = {
  user_id: string;
  session_id: string;
};

const getExistingSession = async (): Promise<Session | null> => {
  const file = Bun.file(SESSION_FILE_PATH);
  if (await file.exists()) {
    let session = await file.json();
    if (sync.verifySession(session)) {
      return session;
    }
    return null;
  }
  return null;
};

const login = async (
  envFilePath: string,
  spinner: Ora | null,
): Promise<Session> => {
  // Attempt to get credentials
  const { YARE_LOGIN, YARE_PASSWORD } = Bun.env;
  if (!YARE_LOGIN || !YARE_PASSWORD) {
    spinner?.warn("Couldn't find login credentials.");

    const getCreds = () => {
      const { value: username } = createPrompt("Yare Username: ", {
        required: true,
      });
      const { value: password } = createPrompt("Password: ", {
        required: true,
        echoMode: "password",
      });
      return { username, password: password };
    };
    let username, password, session;
    while (!session) {
      const creds = getCreds();
      username = creds.username;
      password = creds.password;
      // spinner?.start("Logging in");
      try {
        session = await sync.login(username, password);
      } catch (e) {
        console.error();
        spinner?.fail("Error logging in. Try again.");
      }
    }
    spinner?.clear();
    const saveCreds =
      createSelection([{ text: "Yes" }, { text: "No" }], {
        headerText:
          `\n${chalk.bold.green("Successfully logged in!")}` +
          "\n\nWould you like to save your credentials?" +
          `\n${chalk.dim(
            "Your password will be stored in plain text in a .env file.",
          )}`,
      }).selectedIndex === 0;

    if (saveCreds) {
      fs.appendFileSync(
        path.resolve(".", envFilePath),
        `# Yare Credentials
YARE_LOGIN=${username}
YARE_PASSWORD=${password}`,
      );
    }
    await saveSession(session);
    return session;
  } else {
    const session = await await sync.login(YARE_LOGIN, YARE_PASSWORD);
    await saveSession(session);
    return session;
  }
};

const saveSession = (session: Session): Promise<number> =>
  Bun.write(SESSION_FILE_PATH, JSON.stringify(session));

type SyncOptions = {
  watch: boolean;
  watchDir: string;
  noMinify: boolean;
  file: string;
  env: string;
};

const buildAndSync = async ({ noMinify, file, env }: SyncOptions) => {
  const buildSpinner = ora("Building");
  buildSpinner.start();
  // Build code
  if (!(await Bun.file(file).exists())) {
    buildSpinner.fail(
      `${chalk.red.bold(
        "Build failed:",
      )} Could not find entrypoint ${chalk.bold(file)}.`,
    );
    process.exit(9);
    return;
  }

  let distFile;
  try {
    const { outputs } = await Bun.build({
      entrypoints: [file],
      outdir: "./dist",
      minify: !noMinify,
    });

    distFile = Bun.file(outputs[0].path);
  } catch (e) {
    buildSpinner.fail(`${chalk.red.bold("Build failed:")} Unexpected error`);
    console.error(e);
    process.exit(1);
  }
  buildSpinner.succeed("Built");

  // Do we have a session?
  const loginSpinner = ora("Logging In");
  loginSpinner.start();
  let session = await getExistingSession();

  if (!session) {
    // Attempt to login.
    loginSpinner.clear();
    session = await login(env, loginSpinner);
  }
  loginSpinner.succeed(`Logged in as ${chalk.green.bold(session.user_id)}`);

  const syncSpinner = ora("Syncing");
  syncSpinner.start();
  const games: { server: string; id: string }[] = await sync.getGames(
    session.user_id,
  );

  if (!games.length) {
    syncSpinner.warn("No current games.");
  } else {
    const successful = await sync.sendCode(
      await distFile.text(),
      games,
      session,
    );
    if (successful) {
      syncSpinner.succeed(
        "Uploaded your code to these games: " +
          games.map((g) => (g ? `${g.server}/${g.id}` : g)).join(", "),
      );
    } else {
      syncSpinner.fail("Upload to yare failed.");
    }
  }
};

const program = new Command();

program
  .command("sync")
  .description("build and sync with yare")
  .option("-w, --watch", "watch for changes", false)
  .option("-nm, --no-minify", "Don't minify the output.", false)
  .option("--env <file>", "The env file to save credentials to", ".env")
  .option("--file <file>", "The input file", "src/index.ts")
  .option("--watch-dir <file>", "The directory to watch", "./src")
  .action(async (options: SyncOptions) => {
    if (options.watch) {
      // If we're in watch mode, clear the terminal.
      Bun.write(Bun.stdout, "\x1Bc");
    }
    await buildAndSync(options);
    if (options.watch) {
      const watchSpinner = ora("Watching for changes...");
      watchSpinner.start();
      if (!fs.existsSync(options.watchDir)) {
        watchSpinner.fail(
          `${chalk.red.bold(
            "Watch failed:",
          )} Could not find watch directory ${chalk.bold(options.watchDir)}.`,
        );
        process.exit(9);
      }
      fs.watch(options.watchDir, { recursive: true }, async () => {
        await buildAndSync(options);
      });
    }
  });

program
  .command("logout")
  .description("clear session and logout")
  .action(async (options: SyncOptions) => {
    const spinner = ora("Log out");
    spinner.start("Logging out");
    fs.unlinkSync(SESSION_FILE_PATH);
    spinner.succeed("Logged out");
  });

await program.parseAsync();
