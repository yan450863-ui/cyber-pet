import { petDesktopEntries } from './pet-runtime-policy.js';
import { n as DESKTOP_PACKAGE_NAME, r as DESKTOP_PACKAGE_NAMES } from "./product-identity-DUPfNg4Q.js";
import { A as desktopNetworkExposureForBrowserAccess, C as parseLinuxWindowMaterial, D as desktopBrowserAccessEnabled, E as desktopBrowserAccessAvailable, M as parseDesktopNetworkExposure, N as parseDesktopOpenBrowser, T as parseWindowsWindowMaterial, j as desktopWebServerHost, s as DesktopShellConfig, w as parseMacosWindowMaterial, x as DEFAULT_MACOS_WINDOW_MATERIAL } from "./settings-bridge-mpB2I1Ui.js";
import { t as DESKTOP_DEFAULT_WEB_PORT } from "./desktop-port-DWrq-_UM.js";
import { i as resolveOverlayPackage, n as findOverlayPackage } from "./package-overlay-Ca250500.js";
import { i as activeDesktopProfileLayers, l as readDesktopDisabledBundles, o as desktopPluginBundleMutable } from "./desktop-plugins-CaaoCZ2N.js";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { PROFILES_DIR, PROFILE_PATCH_FILENAME, PROFILE_TEMPLATES, bundlePatchPaths, composeEntries, initProfile, loadOptionalPatches, loadOverlayPatches, readProfileManifest, resolveProfileDir, writeProfileManifest } from "@deepseek-ai/dsh-app-boot";
import { isIP } from "node:net";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { evaluate, isJsExpr } from "@deepseek-ai/cordis-plugin-loader";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { isMap, isPair, isScalar, isSeq, parseAllDocuments, parseDocument } from "yaml";
//#region src/disposable-tree.ts
/** Cleanup for caller-owned disposable trees; never traverse junction targets. */
const CLEANUP_RETRY_CODES = /* @__PURE__ */ new Set([
	"EBUSY",
	"EMFILE",
	"ENFILE",
	"ENOTEMPTY",
	"EPERM"
]);
function removeDisposableEntry(path) {
	try {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink() || !stat.isDirectory()) {
			unlinkSync(path);
			return;
		}
		for (const name of readdirSync(path)) removeDisposableEntry(join(path, name));
		rmdirSync(path);
	} catch (cause) {
		if (cause.code !== "ENOENT") throw cause;
	}
}
/** Remove an owned temporary root, including a root junction, with bounded retries. */
function cleanupDisposableTree(rootDir) {
	try {
		lstatSync(rootDir);
	} catch (cause) {
		if (cause.code === "ENOENT") return false;
		throw cause;
	}
	for (let attempt = 0;; attempt++) try {
		removeDisposableEntry(rootDir);
		return true;
	} catch (cause) {
		if (attempt >= 3 || !CLEANUP_RETRY_CODES.has(cause.code ?? "")) throw cause;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
	}
}
//#endregion
//#region src/link-projections.ts
/** Retire dsh 0.1.5 link-backend projections without traversing junction targets. */
/** Directory where the dsh 0.1.5 link backend projected bundle-carried packages into a profile. */
const LINK_PROJECTION_DIR = ".dsh-module-fallback";
/** Top-level and scoped `node_modules` entries that are symlinks or junctions. */
function symlinksUnder(modules) {
	const links = [];
	let entries;
	try {
		entries = readdirSync(modules, { withFileTypes: true });
	} catch (cause) {
		if (cause.code === "ENOENT") return links;
		throw cause;
	}
	for (const entry of entries) {
		const path = join(modules, entry.name);
		if (entry.isSymbolicLink()) links.push(path);
		else if (entry.name.startsWith("@") && entry.isDirectory()) {
			for (const child of readdirSync(path, { withFileTypes: true })) if (child.isSymbolicLink()) links.push(join(path, child.name));
		}
	}
	return links;
}
/** Whether a link's target lies in `root`, compared through the target's real parent directory. */
function pointsInto(link, root) {
	try {
		const target = resolve(dirname(link), readlinkSync(link));
		const parent = realpathSync.native(dirname(target));
		const rootPath = realpathSync.native(root);
		return parent === rootPath || parent.startsWith(rootPath + sep);
	} catch (cause) {
		if (cause.code === "ENOENT") return false;
		throw cause;
	}
}
/**
* Remove the package projections a dsh 0.1.5 link-backend launch left in one profile.
*
* Selection matches upstream `removeLinkProjections`: only `node_modules` links whose
* target lies inside `<profile>/.dsh-module-fallback/node_modules` are unlinked, then that
* directory is removed; pnpm-installed packages and every other link stay.
*
* Upstream finishes with `rmSync(owned, { recursive: true })`. The projection directory
* holds junctions into a Desktop installation, and Electron 44's Node (24.18.1) follows
* those junctions during a recursive `rmSync`, emptying the installation packages they
* point to. Desktop therefore never calls the upstream helper and removes every link
* itself without visiting its target.
* @param dir - the profile directory.
* @returns whether a projection directory was present.
*/
function removeLinkProjectionsSafely(dir) {
	const owned = join(dir, LINK_PROJECTION_DIR);
	if (lstatSync(owned, { throwIfNoEntry: false }) === void 0) return false;
	const ownedModules = join(owned, "node_modules");
	for (const link of symlinksUnder(join(dir, "node_modules"))) if (pointsInto(link, ownedModules)) unlinkSync(link);
	cleanupDisposableTree(owned);
	return true;
}
//#endregion
//#region src/desktop-market.ts
/** Machine-level Desktop Market provider selection and fail-safe state. */
const BIN_NAME$1 = "dsh-plugin-desktop";
const STATE_VERSION = 1;
const STATE_DIRECTORY_NAME = "desktop-market";
const STATE_FILENAME = "state.json";
const STATE_DIRECTORY_MODE = 448;
const STATE_FILE_MODE = 384;
const MAX_STATE_BYTES = 4 * 1024;
/** Canonical Loader identities owned by the Desktop provider switch. */
const DESKTOP_MARKET_IDENTITIES = Object.freeze({
	community: Object.freeze({
		provider: "community-market",
		rowId: "community-market",
		packageName: "dsh-community-market"
	}),
	dshMarket: Object.freeze({
		provider: "dsh-market",
		rowId: "dsh-market",
		packageName: "dshmarket"
	})
});
const DEFAULT_SNAPSHOT = Object.freeze({
	requested: "disabled",
	effective: "disabled",
	legacyDefaulted: true
});
function snapshot(requested, legacyDefaulted) {
	return Object.freeze({
		requested,
		effective: requested,
		legacyDefaulted
	});
}
/** Preserve the explicit request while projecting a generation-local effective provider. */
function desktopMarketSnapshotWithEffective(current, effective) {
	if (!isProvider(current.requested) || !isProvider(current.effective) || typeof current.legacyDefaulted !== "boolean" || !isProvider(effective)) throw new TypeError(`${BIN_NAME$1}: invalid Desktop Market snapshot`);
	return Object.freeze({
		requested: current.requested,
		effective,
		legacyDefaulted: current.legacyDefaulted
	});
}
function isProvider(value) {
	return value === "disabled" || value === "community-market" || value === "dsh-market";
}
function invalidState(message) {
	return /* @__PURE__ */ new Error(`${BIN_NAME$1}: invalid Desktop Market state: ${message}`);
}
/** Validate a user-data directory and return its fixed machine-level state path. */
function desktopMarketStatePath(userDataDir) {
	if (typeof userDataDir !== "string" || !isAbsolute(userDataDir) || userDataDir.includes("\0") || userDataDir.length === 0) throw new TypeError(`${BIN_NAME$1}: Desktop Market user-data directory must be an absolute path without NUL`);
	return join(userDataDir, STATE_DIRECTORY_NAME, STATE_FILENAME);
}
/** Validate an exact state path before reading or writing it. */
function assertDesktopMarketStatePath(statePath) {
	if (typeof statePath !== "string" || !isAbsolute(statePath) || statePath.includes("\0") || basename(statePath) !== STATE_FILENAME || basename(dirname(statePath)) !== STATE_DIRECTORY_NAME) throw new TypeError(`${BIN_NAME$1}: Desktop Market state path must be <userData>/${STATE_DIRECTORY_NAME}/${STATE_FILENAME}`);
}
/** Parse the strict version-one persisted state document. */
function parseDesktopMarketState(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidState("root must be an object");
	const object = value;
	const keys = Object.keys(object).sort();
	if (keys.length !== 3 || keys[0] !== "legacyDefaulted" || keys[1] !== "requested" || keys[2] !== "version") throw invalidState("unexpected fields");
	if (object.version !== STATE_VERSION) throw invalidState("unsupported version");
	if (!isProvider(object.requested)) throw invalidState("requested provider is invalid");
	if (object.legacyDefaulted !== false) throw invalidState("legacyDefaulted must be false");
	return Object.freeze({
		version: 1,
		requested: object.requested,
		legacyDefaulted: false
	});
}
function readRawState(statePath) {
	const pathInfo = lstatSync(statePath);
	if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) throw invalidState("state must be a regular file");
	const descriptor = openSync(statePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	try {
		const info = fstatSync(descriptor);
		if (!info.isFile() || info.size > MAX_STATE_BYTES) throw invalidState("state must be a regular file within the size limit");
		return JSON.parse(readFileSync(descriptor, "utf8"));
	} finally {
		closeSync(descriptor);
	}
}
/** Read the state without ever writing a migration or repair marker. */
function readDesktopMarketState(statePath) {
	assertDesktopMarketStatePath(statePath);
	try {
		return snapshot(parseDesktopMarketState(readRawState(statePath)).requested, false);
	} catch {
		return DEFAULT_SNAPSHOT;
	}
}
/** Read the state using the Electron user-data directory convention. */
function readDesktopMarketStateForUserData(userDataDir) {
	return readDesktopMarketState(desktopMarketStatePath(userDataDir));
}
function assertRealStateDirectory(statePath) {
	const directory = dirname(statePath);
	try {
		const info = lstatSync(directory);
		if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${BIN_NAME$1}: Desktop Market state directory must be a real directory`);
		chmodSync(directory, STATE_DIRECTORY_MODE);
	} catch (cause) {
		if (cause.code === "ENOENT") {
			mkdirSync(directory, {
				recursive: true,
				mode: STATE_DIRECTORY_MODE
			});
			const info = lstatSync(directory);
			if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${BIN_NAME$1}: Desktop Market state directory must be a real directory`);
			chmodSync(directory, STATE_DIRECTORY_MODE);
			return;
		}
		throw cause;
	}
}
/** Persist an explicit provider choice with a locked, atomic replacement. */
async function writeDesktopMarketSelection(statePath, provider) {
	assertDesktopMarketStatePath(statePath);
	if (!isProvider(provider)) throw new TypeError(`${BIN_NAME$1}: invalid Desktop Market provider`);
	assertRealStateDirectory(statePath);
	const state = Object.freeze({
		version: 1,
		requested: provider,
		legacyDefaulted: false
	});
	const rendered = `${JSON.stringify(state)}\n`;
	await withFileLock(statePath, async () => {
		assertRealStateDirectory(statePath);
		await writeFileAtomic(statePath, rendered, {
			mode: STATE_FILE_MODE,
			dirMode: STATE_DIRECTORY_MODE
		});
	});
	return snapshot(provider, false);
}
/** Persist an explicit provider choice using the fixed Electron user-data path. */
async function selectDesktopMarketProvider(userDataDir, provider) {
	return writeDesktopMarketSelection(desktopMarketStatePath(userDataDir), provider);
}
Object.freeze({
	stateVersion: STATE_VERSION,
	stateDirectoryName: STATE_DIRECTORY_NAME,
	stateFilename: STATE_FILENAME,
	stateDirectoryMode: STATE_DIRECTORY_MODE,
	stateFileMode: STATE_FILE_MODE
});
//#endregion
//#region src/profile.ts
/** Compatibility profile composition over the official Web bundle and user plugins. */
/** Persistent profile managed by the desktop launcher and the ordinary dsh plugin command. */
const DESKTOP_PROFILE_NAME = "desktop";
/** Empty include root rewritten before every profile boot. */
const DESKTOP_PROFILE_ROOT = "cordis.yml";
const AA_PACKAGE_NAME = "@agents-anywhere/dsh-bridge-next";
const AA_ROW_ID = "agents-anywhere-bridge-next";
const BIN_NAME = DESKTOP_PACKAGE_NAME;
const REQUIRED_BUNDLES = requiredWebBundles();
const REQUIRED_BUNDLE_SET = new Set(REQUIRED_BUNDLES);
const OBSOLETE_DESKTOP_BUNDLE_SET = /* @__PURE__ */ new Set(["@deepseek-ai/dsh-desktop-app"]);
const INSTALL_ANCHOR = fileURLToPath(new URL("../package.json", import.meta.url));
const DESKTOP_PATCH_PATH = fileURLToPath(new URL("../cordis.patch.yml", import.meta.url));
const DIRECTORY_PICKER_ROW_ID = "directory-picker";
const AUTO_PICKER_PACKAGE = "@deepseek-ai/dsh-host-directory-picker-auto";
const BROWSE_PICKER_BACKEND = "@deepseek-ai/dsh-host-directory-picker-browse";
const BROWSE_PICKER_SURFACE = "@deepseek-ai/dsh-client-ui-directory-picker-browse";
const PWSH_SANDBOX_ROW_ID = "pwsh-sandbox";
const UPSTREAM_PWSH_SANDBOX_PACKAGE = "@deepseek-ai/dsh-pwsh-sandbox";
const DESKTOP_WINDOWS_PWSH_SANDBOX_ROW_ID = "desktop-windows-pwsh-sandbox";
const DESKTOP_WINDOWS_PWSH_SANDBOX_PACKAGE = `${DESKTOP_PACKAGE_NAME}/windows-pwsh-sandbox`;
/** Upstream Web rows that exist only to send Desktop product analytics to DeepSeek. */
const UPSTREAM_PRODUCT_ANALYTICS_ROW_IDS = ["desktop-product-telemetry", "product-analytics"];
const DEFAULT_DESKTOP_SHELL_MODE = "compatibility";
const DEFAULT_DESKTOP_PORT = DESKTOP_DEFAULT_WEB_PORT;
const DESKTOP_WEB_SERVER_ROW_ID = "desktop-webserver";
const DESKTOP_WEB_SERVER_PACKAGE = `${DESKTOP_PACKAGE_NAME}/webserver`;
const SETTINGS_PACKAGE = "@deepseek-ai/dsh-settings";
/** Legacy harness-home document the upstream one-shot import still reads. */
const SETTINGS_DOCUMENT_FILENAME = "settings.yaml";
const SETTINGS_DOCUMENT_FORMATS = Object.freeze({
	".yaml": "yaml",
	".yml": "yaml",
	".json": "json"
});
const DESKTOP_SETTINGS_NAMESPACE = "dsh-desktop";
/** Loader entry id the settings import keys Desktop's shell section by. */
const DESKTOP_SHELL_ENTRY_ID = "desktop-shell";
const UI_LAYOUT_PACKAGE = "@deepseek-ai/dsh-client-ui-layout";
const UI_SIDEBAR_PACKAGE = "@deepseek-ai/dsh-client-ui-sidebar";
const UI_CONVERSATION_PACKAGE = "@deepseek-ai/dsh-client-ui-conversation";
const DEFAULT_DESKTOP_MARKET_SNAPSHOT = Object.freeze({
	requested: "disabled",
	effective: "disabled",
	legacyDefaulted: true
});
const MARKET_ROW_IDS = /* @__PURE__ */ new Set([DESKTOP_MARKET_IDENTITIES.community.rowId, DESKTOP_MARKET_IDENTITIES.dshMarket.rowId]);
const MARKET_PACKAGE_NAMES = /* @__PURE__ */ new Set([DESKTOP_MARKET_IDENTITIES.community.packageName, DESKTOP_MARKET_IDENTITIES.dshMarket.packageName]);
/**
* Parse desktop presentation state and reject corrupted values.
* @param value - untrusted settings value.
* @returns a supported desktop shell mode.
*/
function parseDesktopShellMode(value) {
	if (value === void 0) return DEFAULT_DESKTOP_SHELL_MODE;
	if (value === "compatibility" || value === "extended" || value === "advanced") return value;
	throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE}.mode must be "compatibility", "extended", or "advanced"`);
}
/** Parse the requested loopback Web port and reject values Node cannot listen on. */
function parseDesktopPort(value) {
	if (value === void 0) return DEFAULT_DESKTOP_PORT;
	if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535) return value;
	throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE}.port must be an integer from 0 through 65535`);
}
const DEFAULT_DESKTOP_STARTUP_SETTINGS = Object.freeze({
	mode: DEFAULT_DESKTOP_SHELL_MODE,
	port: DEFAULT_DESKTOP_PORT,
	macosMaterial: DEFAULT_MACOS_WINDOW_MATERIAL,
	windowsMaterial: "off",
	linuxMaterial: "off",
	openBrowser: false,
	networkExposure: "loopback"
});
/**
* Read Desktop startup settings from one parsed settings document.
* @param document - untrusted settings document root.
* @returns validated mode and port defaults for the next generation.
*/
function desktopStartupSettingsFromSettings(document) {
	if (typeof document !== "object" || document === null || Array.isArray(document)) throw new Error(`${BIN_NAME}: settings document must be a map of namespace sections`);
	const section = document[DESKTOP_SETTINGS_NAMESPACE];
	if (section === void 0) return { ...DEFAULT_DESKTOP_STARTUP_SETTINGS };
	if (typeof section !== "object" || section === null || Array.isArray(section)) throw new Error(`${BIN_NAME}: ${DESKTOP_SETTINGS_NAMESPACE} settings must be a map`);
	const values = section;
	const mode = parseDesktopShellMode(values.mode);
	const networkExposure = parseDesktopNetworkExposure(values.networkExposure);
	const openBrowser = desktopBrowserAccessEnabled(mode, parseDesktopOpenBrowser(values.openBrowser), networkExposure);
	return {
		mode,
		port: parseDesktopPort(values.port),
		macosMaterial: parseMacosWindowMaterial(values.macosMaterial),
		windowsMaterial: parseWindowsWindowMaterial(values.windowsMaterial),
		linuxMaterial: parseLinuxWindowMaterial(values.linuxMaterial),
		openBrowser,
		networkExposure: desktopNetworkExposureForBrowserAccess(openBrowser, networkExposure)
	};
}
/** Read only the shell mode from one parsed settings document. */
function desktopShellModeFromSettings(document) {
	return desktopStartupSettingsFromSettings(document).mode;
}
/**
* Resolve the settings document the Host reads before the Loader starts.
* @param config - explicit path and/or harness-home override.
* @returns the absolute filename and its parsed format.
* @throws {Error} when the path carries an unsupported extension.
*/
function resolveDesktopSettingsDocument(config = {}) {
	const filename = resolve(config.path ?? join(resolveDshHome(config.dshHome), SETTINGS_DOCUMENT_FILENAME));
	const format = SETTINGS_DOCUMENT_FORMATS[extname(filename).toLowerCase()];
	if (format === void 0) throw new Error(`${BIN_NAME}: settings document extension ${JSON.stringify(extname(filename))} is not supported (use .yaml, .yml, or .json)`);
	return {
		filename,
		format
	};
}
/**
* Desktop's own legacy-to-entry section renames for the harness-home document.
*
* 0.1.7's one-shot import (`SettingsForms#importLegacyDocument`) keys every
* section of `settings.yaml` by Loader entry id and carries a rename table
* (`LEGACY_SECTION_ENTRIES`) that only covers the kernel's own renames. Desktop
* renamed its two sections in this port -- the settings namespace is now the
* Loader entry id, and those rows are `desktop-shell` and `desktop-notifications`
* -- so without this table the import raises `No configurable plugin entry
* "dsh-desktop"`, logs a warning nobody reads, and then renames the document to
* `settings.yaml.imported` anyway. Every user upgrading from 0.1.6 would lose
* window mode, all three materials, port, browser intent, network exposure, log
* level and every notification preference, silently and irreversibly.
*
* Desktop's own two sections kept every field name, so for them the section key
* is the whole migration.
*
* `agent-presets` is upstream's row, not Desktop's, but it has the same gap:
* 0.1.7 renamed the row to `agent-preset-registry`
* (`packages/bundle/web-app/cordis.patch.yml:541`) without adding the pair to
* `LEGACY_SECTION_ENTRIES`, so the import logs `No configurable plugin entry
* "agent-presets"` and drops the section. The user's chosen default preset is
* discarded and the bundle's own `default: standard` takes over. Desktop is the
* only edition that owns this document before the Loader starts, so the rename
* has to happen here or not at all.
*
* That row also renamed the field. 0.1.6's `default` was the user's choice;
* 0.1.7 keeps `default` as the bundle-authored fallback and moves the choice to
* `selectedDefault`, which is the only one of the two declared `.volatile()`
* (`@deepseek-ai/dsh-agent-preset-registry/lib/index.js:454`). The distinction is
* not cosmetic: `SettingsForms#write` throws `Config field "default" is not
* volatile` before it persists anything, so importing the legacy key under its
* old name loses the value just as completely as dropping the section. The
* service reads `enabled ? selectedDefault ?? default : default`, so the
* imported choice takes effect as soon as it lands under the new name.
*/
const LEGACY_DESKTOP_SETTINGS_SECTIONS = Object.freeze([
	Object.freeze({
		legacy: "dsh-desktop",
		entryId: "desktop-shell"
	}),
	Object.freeze({
		legacy: "dsh-desktop-notifications",
		entryId: "desktop-notifications"
	}),
	Object.freeze({
		legacy: "agent-presets",
		entryId: "agent-preset-registry",
		fields: Object.freeze([Object.freeze(["default", "selectedDefault"])])
	})
]);
/**
* Rename Desktop's legacy sections in place so upstream's import can find them.
*
* Runs in the launcher, before the Loader starts and therefore before the
* settings plugin consumes and renames the document. Renaming the key node
* rather than re-setting the map keeps each section's position, comments and
* scalar styles intact, so a document this edition does not fully understand
* survives untouched.
*
* Idempotent in both directions, for section keys and for the field renames
* inside them: a name 0.1.7 already uses has nothing to rename, and a document
* that somehow carries both names keeps the current one, because that is the one
* 0.1.7 would have written.
*
* @param spec - resolved location and encoding of the settings document.
* @returns the entry ids whose section was rewritten; empty when nothing changed.
*/
function migrateDesktopSettingsDocumentSections(spec) {
	if (spec.format !== "yaml") return [];
	let text;
	try {
		text = readFileSync(spec.filename, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") return [];
		throw cause;
	}
	const document = parseDocument(text, { prettyErrors: true });
	if (document.errors.length > 0) return [];
	const contents = document.contents;
	if (!isMap(contents)) return [];
	const keyed = (map, name) => map.items.find((item) => isPair(item) && isScalar(item.key) && item.key.value === name);
	const migrated = [];
	for (const { legacy, entryId, fields } of LEGACY_DESKTOP_SETTINGS_SECTIONS) {
		const current = keyed(contents, entryId);
		const section = current ?? keyed(contents, legacy);
		if (section === void 0 || !isScalar(section.key)) continue;
		let changed = false;
		if (current === void 0) {
			section.key.value = entryId;
			changed = true;
		}
		const values = section.value;
		if (fields !== void 0 && isMap(values)) for (const [legacyField, field] of fields) {
			if (keyed(values, field) !== void 0) continue;
			const pair = keyed(values, legacyField);
			if (pair === void 0 || !isScalar(pair.key)) continue;
			pair.key.value = field;
			changed = true;
		}
		if (changed) migrated.push(entryId);
	}
	if (migrated.length === 0) return [];
	writeFileSync(spec.filename, String(document));
	return migrated;
}
/**
* Read startup settings from the same file resolved by the settings provider.
* @param config - validated settings-document locator.
* @returns the values projected into the startup Loader graph.
*/
function readDesktopStartupSettings(config) {
	const spec = resolveDesktopSettingsDocument(config);
	let text;
	try {
		text = readFileSync(spec.filename, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") return { ...DEFAULT_DESKTOP_STARTUP_SETTINGS };
		throw cause;
	}
	let document;
	if (spec.format === "yaml") {
		const parsed = parseDocument(text, { prettyErrors: true });
		if (parsed.errors.length > 0) throw new Error(`${BIN_NAME}: invalid settings document at ${spec.filename}: ${parsed.errors.map((error) => error.message).join("; ")}`);
		document = parsed.toJS() ?? {};
	} else document = text.trim().length === 0 ? {} : JSON.parse(text);
	return desktopStartupSettingsFromSettings(document);
}
/** Read only the shell mode from the settings provider's resolved file. */
function readDesktopShellMode(config) {
	return readDesktopStartupSettings(config).mode;
}
/**
* The desktop-shell section of a settings document the settings service has not imported yet.
*
* The setup wizard, the recovery window and every 0.1.6 install write startup choices to
* the harness-home document, but 0.1.7's settings service only merges that document into
* the profile patch layer after the Loader is up (`SettingsForms#importLegacyDocument`),
* and renames it to `settings.yaml.imported` as it does. The launcher's layout patches and
* the shell plugin's own row both resolve before that, so while the document still exists
* under its own name its section is the value the row is about to have. Reading only the
* composed row booted the first generation after the wizard in compatibility mode, and the
* import then switched the row to the chosen mode underneath it: the recomposed profile
* dropped `ui-layout` while the open renderer never installed Desktop's own layout, so
* eighteen client plugins waited on a layout service forever and startup went to recovery.
* @param spec - the resolved harness-home document, after section migration.
* @returns the pending section, or undefined when there is nothing left to import.
*/
function pendingDesktopShellSection(spec) {
	if (spec.format !== "yaml") return void 0;
	let text;
	try {
		text = readFileSync(spec.filename, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") return void 0;
		throw cause;
	}
	const parsed = parseDocument(text, { prettyErrors: true });
	if (parsed.errors.length > 0) return void 0;
	const root = parsed.toJS();
	if (typeof root !== "object" || root === null || Array.isArray(root)) return void 0;
	const section = root[DESKTOP_SHELL_ENTRY_ID];
	return typeof section === "object" && section !== null && !Array.isArray(section) ? section : void 0;
}
/** Fields the import may write; it refuses a section carrying any other key. */
const PENDING_DESKTOP_SHELL_FIELDS = /* @__PURE__ */ new Set([
	"mode",
	"macosMaterial",
	"windowsMaterial",
	"linuxMaterial",
	"port",
	"openBrowser",
	"networkExposure",
	"logLevel",
	"developerLogging"
]);
/**
* The desktop-shell config as it will stand once the pending document is imported.
* @param composed - the composed desktop-shell row config.
* @param pending - the section {@link pendingDesktopShellSection} found, if any.
* @param platform - native platform the import validates the section for.
* @returns the merged config, or undefined when the import would not apply it.
*/
function pendingDesktopShellConfig(composed, pending, platform) {
	if (pending === void 0) return void 0;
	if (Object.keys(pending).some((key) => !PENDING_DESKTOP_SHELL_FIELDS.has(key))) return void 0;
	const merged = {
		...composed,
		...pending
	};
	let mode;
	let openBrowser;
	try {
		const candidate = DesktopShellConfig(merged);
		mode = candidate.mode.get();
		openBrowser = candidate.openBrowser.get();
		desktopStartupSettingsFromSettings({ [DESKTOP_SETTINGS_NAMESPACE]: merged });
	} catch {
		return;
	}
	if (!desktopBrowserAccessAvailable(mode) && openBrowser) return void 0;
	if (mode !== "compatibility" && platform === "linux") return void 0;
	return merged;
}
/**
* Merge the pending desktop-shell section into the profile patch layer and drop it
* from the settings document, the way the import would, but before the Loader starts.
*
* The row is written exactly as the config editor writes it (the last plain
* `desktop-shell` row, else a new one), so later edits find and update it. The
* profile is written first: if the process dies before the document is rewritten,
* the next launch merges the same values again, which changes nothing. Each file
* is replaced in one step, so a crash never leaves a half-written profile, and a
* symlinked document is left to the import rather than replaced by a copy.
* @param patchPath - the profile's own patch document.
* @param rowName - the composed desktop-shell row's package identity.
* @param spec - the resolved harness-home document.
* @param section - the validated pending section.
* @returns whether both documents were rewritten; on false the upstream import
*   still merges the section later, as it did before.
*/
function importPendingDesktopShellSection(patchPath, rowName, spec, section) {
	try {
		if ([patchPath, spec.filename].some((path) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink())) return false;
		let before;
		try {
			before = readFileSync(patchPath, "utf8");
		} catch (cause) {
			if (cause.code !== "ENOENT") throw cause;
			before = "[]\n";
		}
		const patchDocument = parseDocument(before, { customTags: [{
			tag: "tag:yaml.org,2002:js",
			resolve: (value) => value
		}] });
		if (patchDocument.errors.length > 0 || !isSeq(patchDocument.contents)) return false;
		const rows = patchDocument.contents;
		rows.flow = false;
		const index = rows.items.findLastIndex((item, index) => isMap(item) && patchDocument.getIn([index, "id"]) === DESKTOP_SHELL_ENTRY_ID && !item.has("insert") && (!item.has("name") || patchDocument.getIn([index, "name"]) === rowName));
		if (index < 0) patchDocument.addIn([], {
			id: DESKTOP_SHELL_ENTRY_ID,
			...typeof rowName === "string" ? { name: rowName } : {},
			config: section
		});
		else {
			const config = patchDocument.getIn([index, "config"], true);
			if (config === void 0) patchDocument.setIn([index, "config"], patchDocument.createNode(section));
			else if (isMap(config)) for (const [key, value] of Object.entries(section)) config.set(key, value);
			else return false;
		}
		const settingsDocument = parseDocument(readFileSync(spec.filename, "utf8"), { prettyErrors: true });
		if (settingsDocument.errors.length > 0 || !isMap(settingsDocument.contents)) return false;
		replaceDocument(patchPath, String(patchDocument));
		settingsDocument.delete(DESKTOP_SHELL_ENTRY_ID);
		replaceDocument(spec.filename, String(settingsDocument));
		return true;
	} catch {
		return false;
	}
}
/** Replace a document in one rename, so a crash leaves either its old or its new bytes. */
function replaceDocument(path, text) {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporary, text, { flag: "wx" });
		renameSync(temporary, path);
	} catch (cause) {
		rmSync(temporary, { force: true });
		throw cause;
	}
}
/** Resolve the public Web template once and reject an incompatible DSH release. */
function requiredWebBundles() {
	const template = PROFILE_TEMPLATES.web;
	if (template === void 0) throw new Error(`${BIN_NAME}: installed dsh-app-boot has no web profile template`);
	return [...template.bundles];
}
/**
* Normalize the installation-owned prefix while preserving third-party order.
* @param current - current persistent bundle list.
* @returns base, Web carrier, then every third-party bundle in prior order.
*/
function desktopBundleList(current) {
	const thirdParty = current.filter((name) => !["dsh-community-market","dshmarket",AA_PACKAGE_NAME].includes(name) && !REQUIRED_BUNDLE_SET.has(name) && !DESKTOP_PACKAGE_NAMES.has(name) && !OBSOLETE_DESKTOP_BUNDLE_SET.has(name));
	return [...REQUIRED_BUNDLES, ...thirdParty];
}
/** Return whether two ordered string lists are identical. */
function sameList(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
/**
* Initialize or repair the persistent desktop profile.
* @param home - Harness home containing the profiles directory.
* @returns the absolute profile directory.
*/
function ensureDesktopProfile(home = resolveDshHome()) {
	const dir = resolveProfileDir(DESKTOP_PROFILE_NAME, home);
	if (!existsSync(join(dir, "package.json"))) initProfile(dir, REQUIRED_BUNDLES);
	const manifest = readProfileManifest(BIN_NAME, dir);
	const rawBundles = (manifest.dsh?.profile)?.bundles;
	if (rawBundles !== void 0 && (!Array.isArray(rawBundles) || rawBundles.some((value) => typeof value !== "string"))) throw new Error(`${BIN_NAME}: dsh.profile.bundles must be an array of package names`);
	const current = rawBundles === void 0 ? [] : rawBundles;
	const bundles = desktopBundleList(current);
	if (!sameList(current, bundles)) writeProfileManifest(dir, {
		...manifest,
		dsh: {
			...manifest.dsh,
			profile: {
				...manifest.dsh?.profile,
				bundles
			}
		}
	});
	return dir;
}
const MANAGED_MARKET_BUNDLES = /* @__PURE__ */ new Set([DESKTOP_MARKET_IDENTITIES.community.packageName, DESKTOP_MARKET_IDENTITIES.dshMarket.packageName]);
/** Read the Market provider and AA toggle state encoded in the Profile manifest's bundle list. */
function readDesktopManagedProfileBundles(profileDir) {
	if (!existsSync(join(profileDir, "package.json"))) return {
		market: "disabled",
		aaEnabled: false
	};
	const rawBundles = (readProfileManifest(BIN_NAME, profileDir).dsh?.profile)?.bundles;
	if (!Array.isArray(rawBundles)) return {
		market: "disabled",
		aaEnabled: false
	};
	const bundles = rawBundles.filter((value) => typeof value === "string");
	const dshMarketIndex = bundles.lastIndexOf(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName);
	const communityIndex = bundles.lastIndexOf(DESKTOP_MARKET_IDENTITIES.community.packageName);
	return {
		market: dshMarketIndex < 0 && communityIndex < 0 ? "disabled" : dshMarketIndex > communityIndex ? "dsh-market" : "community-market",
		aaEnabled: bundles.includes(AA_PACKAGE_NAME)
	};
}
/**
* Synchronize the Profile manifest's `dsh.profile.bundles` list with the active
* Market provider and AA toggle state so `dsh-plugin-manager` reports and
* toggles the exact bundles that Desktop is running.
*/
function syncDesktopManagedProfileBundles(profileDir, state) {
	if (!existsSync(join(profileDir, "package.json"))) return;
	const manifest = readProfileManifest(BIN_NAME, profileDir);
	const rawBundles = (manifest.dsh?.profile)?.bundles;
	if (rawBundles !== void 0 && (!Array.isArray(rawBundles) || rawBundles.some((value) => typeof value !== "string"))) return;
	const current = rawBundles === void 0 ? [] : rawBundles;
	const wantedMarketBundle = state.market === "dsh-market" ? DESKTOP_MARKET_IDENTITIES.dshMarket.packageName : state.market === "community-market" ? DESKTOP_MARKET_IDENTITIES.community.packageName : void 0;
	const next = current.filter((name) => {
		if (MANAGED_MARKET_BUNDLES.has(name)) return name === wantedMarketBundle;
		if (name === AA_PACKAGE_NAME) return state.aaEnabled;
		return true;
	});
	if (wantedMarketBundle !== void 0 && !next.includes(wantedMarketBundle)) next.push(wantedMarketBundle);
	if (state.aaEnabled && !next.includes(AA_PACKAGE_NAME)) next.push(AA_PACKAGE_NAME);
	if (!sameList(current, next)) writeProfileManifest(profileDir, {
		...manifest,
		dsh: {
			...manifest.dsh,
			profile: {
				...manifest.dsh?.profile,
				bundles: next
			}
		}
	});
}
const OFFICIAL_PLUGIN_MARKET_BUNDLE = "@deepseek-ai/dsh-experimental-plugin-market-bundle";
const OFFICIAL_PLUGIN_MARKET_ROW_ID = "plugin-market";
const OFFICIAL_PLUGIN_MARKET_PACKAGE = "@deepseek-ai/dsh-plugin-market";
/** Built-in dsh-market index URL preconfigured when enabling the official Custom Plugin Market in Setup. */
const DEFAULT_OFFICIAL_MARKET_INDEX_URL = "https://cdn.jsdelivr.net/gh/realguan/dsh-plugin-market@dist/dsh-index.json";
/** Inspect whether the active Profile manifest currently enables the official Custom Plugin Market bundle. */
function readDesktopOfficialPluginMarketEnabled(profileDir) {
	if (!existsSync(join(profileDir, "package.json"))) return false;
	try {
		const rawBundles = (readProfileManifest(BIN_NAME, profileDir).dsh?.profile)?.bundles;
		return Array.isArray(rawBundles) && rawBundles.includes(OFFICIAL_PLUGIN_MARKET_BUNDLE);
	} catch {
		return false;
	}
}
/**
* Enable or disable the official Custom Plugin Market bundle in the Profile manifest,
* and preconfigure the built-in dsh-market index URL in `cordis.patch.yml` when enabling.
*/
function configureDesktopOfficialPluginMarket(profileDir, enabled) {
	if (!existsSync(join(profileDir, "package.json"))) return;
	const manifest = readProfileManifest(BIN_NAME, profileDir);
	const rawBundles = (manifest.dsh?.profile)?.bundles;
	if (rawBundles !== void 0 && (!Array.isArray(rawBundles) || rawBundles.some((value) => typeof value !== "string"))) return;
	const current = rawBundles === void 0 ? [] : rawBundles;
	const next = enabled ? current.includes(OFFICIAL_PLUGIN_MARKET_BUNDLE) ? current : [...current, OFFICIAL_PLUGIN_MARKET_BUNDLE] : current.filter((name) => name !== OFFICIAL_PLUGIN_MARKET_BUNDLE);
	if (!sameList(current, next)) writeProfileManifest(profileDir, {
		...manifest,
		dsh: {
			...manifest.dsh,
			profile: {
				...manifest.dsh?.profile,
				bundles: next
			}
		}
	});
	if (!enabled) return;
	configureDesktopOfficialPluginMarketDefaultSource(join(profileDir, PROFILE_PATCH_FILENAME));
}
function configureDesktopOfficialPluginMarketDefaultSource(patchPath) {
	if (lstatSync(patchPath, { throwIfNoEntry: false })?.isSymbolicLink()) return;
	let before;
	try {
		before = readFileSync(patchPath, "utf8");
	} catch (cause) {
		if (cause.code !== "ENOENT") throw cause;
		before = "[]\n";
	}
	const patchDocument = parseDocument(before, { customTags: [{
		tag: "tag:yaml.org,2002:js",
		resolve: (value) => value
	}] });
	if (patchDocument.errors.length > 0 || !isSeq(patchDocument.contents)) return;
	const rows = patchDocument.contents;
	rows.flow = false;
	const index = rows.items.findLastIndex((item, index) => isMap(item) && patchDocument.getIn([index, "id"]) === OFFICIAL_PLUGIN_MARKET_ROW_ID && !item.has("insert") && (!item.has("name") || patchDocument.getIn([index, "name"]) === OFFICIAL_PLUGIN_MARKET_PACKAGE));
	if (index < 0) patchDocument.addIn([], {
		id: OFFICIAL_PLUGIN_MARKET_ROW_ID,
		config: { indexes: [DEFAULT_OFFICIAL_MARKET_INDEX_URL] }
	});
	else {
		const config = patchDocument.getIn([index, "config"], true);
		if (config === void 0) patchDocument.setIn([index, "config"], patchDocument.createNode({ indexes: [DEFAULT_OFFICIAL_MARKET_INDEX_URL] }));
		else if (isMap(config)) {
			const rawIndexes = config.toJS(patchDocument);
			const existing = Array.isArray(rawIndexes.indexes) ? rawIndexes.indexes.filter((entry) => typeof entry === "string") : [];
			const nextIndexes = existing.includes("https://cdn.jsdelivr.net/gh/realguan/dsh-plugin-market@dist/dsh-index.json") ? existing : [DEFAULT_OFFICIAL_MARKET_INDEX_URL, ...existing];
			config.set("indexes", patchDocument.createNode(nextIndexes));
		} else return;
	}
	replaceDocument(patchPath, String(patchDocument));
}
/** Parse one Profile-owned pnpm document as a YAML map. */
function parseProfileYaml(path) {
	const document = parseDocument(readFileSync(path, "utf8"), { prettyErrors: true });
	if (document.errors.length > 0) throw new Error(`${BIN_NAME}: invalid Profile pnpm document at ${path}: ${document.errors.map((error) => error.message).join("; ")}`);
	const value = document.toJS();
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${BIN_NAME}: Profile pnpm document ${path} must hold a YAML map`);
	return {
		document,
		value
	};
}
/** Apply the current out-of-tree plugin linker contract while preserving other workspace settings. */
function reconcileProfilePnpmWorkspace(profileDir) {
	const path = join(profileDir, "pnpm-workspace.yaml");
	if (!existsSync(path)) {
		writeFileSync(path, `packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n`);
		return true;
	}
	const { document } = parseProfileYaml(path);
	let changed = false;
	if (document.get("packages") === void 0) {
		document.set("packages", ["."]);
		changed = true;
	}
	if (document.get("nodeLinker") !== "hoisted") {
		document.set("nodeLinker", "hoisted");
		changed = true;
	}
	if (document.get("autoInstallPeers") !== false) {
		document.set("autoInstallPeers", false);
		changed = true;
	}
	if (changed) writeFileSync(path, document.toString());
	return changed;
}
/** Read the virtual-store path limit pnpm applies to this Profile. */
function profileVirtualStoreDirMaxLength(profileDir, platform) {
	const configured = parseProfileYaml(join(profileDir, "pnpm-workspace.yaml")).value.virtualStoreDirMaxLength;
	if (configured === void 0) return platform === "win32" ? 60 : 120;
	if (typeof configured !== "number" || !Number.isInteger(configured) || configured < 0) throw new Error(`${BIN_NAME}: pnpm-workspace.yaml virtualStoreDirMaxLength must be a non-negative integer`);
	return configured;
}
/** Return whether private module metadata was written by a compatible pnpm generation. */
function compatiblePnpmPackageManager(value) {
	if (typeof value !== "string") return false;
	const match = /^pnpm@(\d+)(?:\.|$)/.exec(value);
	return match !== null && Number(match[1]) >= 10;
}
/** Detect pnpm state that cannot satisfy the current hoisted Profile contract. */
function profileDependencyMigrationRequired(profileDir, workspaceChanged, platform) {
	const manifest = readProfileManifest(BIN_NAME, profileDir);
	const hasDependencies = Object.keys(manifest.dependencies ?? {}).length > 0;
	const modulesDir = join(profileDir, "node_modules");
	const hasModules = existsSync(modulesDir);
	if (!hasDependencies && !hasModules) return false;
	let modulesCompatible = false;
	const modulesStatePath = join(modulesDir, ".modules.yaml");
	if (existsSync(modulesStatePath)) try {
		const modulesState = parseProfileYaml(modulesStatePath).value;
		modulesCompatible = modulesState.nodeLinker === "hoisted" && compatiblePnpmPackageManager(modulesState.packageManager) && modulesState.virtualStoreDirMaxLength === profileVirtualStoreDirMaxLength(profileDir, platform);
	} catch {}
	const lockfilePath = join(profileDir, "pnpm-lock.yaml");
	let lockfileCompatible = !existsSync(lockfilePath) && !hasDependencies;
	if (existsSync(lockfilePath)) try {
		const settings = parseProfileYaml(lockfilePath).value.settings;
		lockfileCompatible = typeof settings === "object" && settings !== null && !Array.isArray(settings) && settings.autoInstallPeers === false;
	} catch {}
	return workspaceChanged || !modulesCompatible || !lockfileCompatible;
}
/** Render one provider failure without leaking an arbitrary thrown object into public state. */
function marketFailureMessage(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
/**
* Load a profile while resolving disabled third-party bundles only after they have been filtered.
* Every direct bundle uses the same Desktop/Profile SemVer overlay that Loader imports use.
* The `dshmarket` bundle is filtered before resolution unless explicitly selected.
*/
function loadRecoveryFilteredProfile(profileName, profileDir, disabledBundles, marketProvider, aaEnabled) {
	if (!existsSync(join(profileDir, "package.json"))) {
		const template = PROFILE_TEMPLATES[profileName];
		if (template === void 0) throw new Error(`${BIN_NAME}: profile ${JSON.stringify(profileName)} does not exist`);
		initProfile(profileDir, template.bundles);
	}
	const rawBundles = (readProfileManifest(BIN_NAME, profileDir).dsh?.profile)?.bundles;
	if (rawBundles !== void 0 && (!Array.isArray(rawBundles) || rawBundles.some((value) => typeof value !== "string"))) throw new Error(`${BIN_NAME}: dsh.profile.bundles must be an array of package names`);
	const selectedBundles = (rawBundles ?? []).filter((packageName) => (aaEnabled || packageName !== AA_PACKAGE_NAME) && packageName !== DESKTOP_MARKET_IDENTITIES.community.packageName && (marketProvider === DESKTOP_MARKET_IDENTITIES.dshMarket.provider || packageName !== DESKTOP_MARKET_IDENTITIES.dshMarket.packageName));
	if (marketProvider === DESKTOP_MARKET_IDENTITIES.dshMarket.provider && !selectedBundles.includes(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName)) selectedBundles.push(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName);
	if (aaEnabled && !selectedBundles.includes(AA_PACKAGE_NAME)) selectedBundles.push(AA_PACKAGE_NAME);
	const layers = [];
	let aaFailure;
	let dshMarketFailure;
	const installPackageUrl = pathToFileURL(INSTALL_ANCHOR).href;
	const profilePackageUrl = pathToFileURL(join(profileDir, "package.json")).href;
	for (const packageName of selectedBundles) {
		const isDshMarket = packageName === DESKTOP_MARKET_IDENTITIES.dshMarket.packageName;
		const isAa = packageName === AA_PACKAGE_NAME;
		if (!isAa && !isDshMarket && desktopPluginBundleMutable(packageName) && disabledBundles.has(packageName)) continue;
		try {
			const packageDir = resolveOverlayPackage(packageName, {
				installPackageUrl,
				profilePackageUrl
			}).selected.packageDir;
			const bundleManifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
			if ((isDshMarket || isAa) && (bundleManifest === null || typeof bundleManifest !== "object" || Array.isArray(bundleManifest) || bundleManifest.name !== packageName)) throw new Error(`${BIN_NAME}: selected ${packageName} bundle has an invalid package identity`);
			const declared = bundleManifest !== null && typeof bundleManifest === "object" ? bundleManifest.dsh?.bundle?.patch : void 0;
			const declaredList = typeof declared === "string" ? [declared] : declared;
			if (!Array.isArray(declaredList) || declaredList.length === 0 || declaredList.some((entry) => typeof entry !== "string" || entry.length === 0)) throw new Error(`${BIN_NAME}: profile bundle ${JSON.stringify(packageName)} declares no dsh.bundle in its package.json`);
			const patchPaths = bundlePatchPaths(packageDir, { patch: declaredList });
			layers.push({
				packageName,
				packageDir,
				patchPaths,
				patches: patchPaths.flatMap((path) => loadOverlayPatches(BIN_NAME, path))
			});
		} catch (cause) {
			if (isAa) aaFailure = marketFailureMessage(cause);
			else if (isDshMarket) dshMarketFailure = marketFailureMessage(cause);
			else throw cause;
		}
	}
	const patchPath = join(profileDir, PROFILE_PATCH_FILENAME);
	return {
		profile: {
			name: profileName,
			dir: profileDir,
			layers,
			skippedBundles: [],
			patchPath,
			patches: existsSync(patchPath) ? loadOverlayPatches(BIN_NAME, patchPath) : []
		},
		...dshMarketFailure === void 0 ? {} : { dshMarketFailure },
		...aaFailure === void 0 ? {} : { aaFailure }
	};
}
/**
* Resolve the Cordis skills shipped by the matching agent-preset dependency.
*
* dsh 0.1.7-alpha.1 split `@deepseek-ai/dsh-agent-presets` into
* `@deepseek-ai/dsh-agent-preset` (the preset model, which ships `skills/`) and
* `@deepseek-ai/dsh-agent-preset-registry` (the Loader-facing service). The preset
* *declarations* moved again, into `@deepseek-ai/dsh-web-app/presets/*.patch.yml`,
* so only the skill tree is still resolved from a package root here.
*/
function shippedSkillRoot(moduleUrl = import.meta.url) {
	return join(dirname(createRequire(moduleUrl).resolve("@deepseek-ai/dsh-agent-preset/package.json")), "skills");
}
/** Read a row's object config without trusting arbitrary YAML values. */
function rowConfig(row) {
	const config = row?.config;
	return config !== null && typeof config === "object" && !Array.isArray(config) ? config : {};
}
/** Snapshot, validate, and deduplicate the LAN allowlist supplied by the launcher. */
function preparedLanAddresses(addresses) {
	const unique = /* @__PURE__ */ new Set();
	for (const address of addresses ?? []) {
		if (isIP(address) !== 4) throw new Error(`${BIN_NAME}: LAN address ${JSON.stringify(address)} is not an IPv4 literal`);
		unique.add(address);
	}
	return Object.freeze([...unique]);
}
/** Merge launcher-derived LAN literals with a profile's explicit Web trust entries. */
function webRuntimeTrustedHosts(configured, lanAddresses) {
	if (configured === void 0) return [...lanAddresses];
	if (!Array.isArray(configured) || configured.some((entry) => typeof entry !== "string")) throw new Error(`${BIN_NAME}: web-runtime trustedHosts must be an array of strings`);
	return [.../* @__PURE__ */ new Set([...configured, ...lanAddresses])];
}
/**
* Carry Desktop's Web trust into Connection when the core no longer routes it
* through the web-runtime row.
*
* Through dsh 0.2.1-alpha.1, web-runtime provided the `webRuntime` service and
* Connection read `ctx.webRuntime.trustedHosts`, so the web-runtime patch was
* enough. 0.2.1-alpha.2 removed that service: Connection now reads only
* `--trusted-host` authorities from `webStartup` and separately accepts its
* bind address. Desktop binds loopback behind the LAN HTTPS edge, which
* forwards the external LAN Host header, so the launcher's snapshot (plus the
* profile's own web-runtime entries) must be appended to Connection itself.
*/
function connectionTrustPatch(connection, trustedHosts) {
	if (connection === void 0) return void 0;
	const inject = connection.inject;
	if ((Array.isArray(inject) ? inject : Object.keys(inject ?? {})).includes("webRuntime")) return void 0;
	const config = rowConfig(connection);
	const configured = config.trustedHosts;
	let merged;
	if (isJsExpr(configured)) merged = trustedHosts.length === 0 ? configured : { __jsExpr: `[...new Set([...(${configured.__jsExpr}), ...${JSON.stringify(trustedHosts)}])]` };
	else if (configured === void 0) merged = [...trustedHosts];
	else if (Array.isArray(configured) && configured.every((entry) => typeof entry === "string")) merged = [.../* @__PURE__ */ new Set([...configured, ...trustedHosts])];
	else throw new Error(`${BIN_NAME}: connection trustedHosts must be an array of strings`);
	return {
		id: "connection",
		config: {
			...config,
			trustedHosts: merged
		}
	};
}
/** Resolve a Loader row's platform gate without mutating the host process. */
function rowDisabledOnPlatform(row, platform) {
	if (!isJsExpr(row.disabled)) return row.disabled === true;
	const scopedProcess = new Proxy(process, { get(target, property) {
		if (property === "platform") return platform;
		const value = Reflect.get(target, property, target);
		return typeof value === "function" ? value.bind(target) : value;
	} });
	return Boolean(evaluate({ process: scopedProcess }, row.disabled.__jsExpr));
}
/** Reject duplicate entries before the Loader turns them into a startup crash. */
function assertUniqueEntryIds(rows) {
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (typeof row.id === "string") {
			if (seen.has(row.id)) throw new Error(`${BIN_NAME}: duplicate loader entry id "${row.id}" in the composed profile`);
			seen.add(row.id);
		}
		if (row.group === true && Array.isArray(row.config)) assertUniqueEntryIds(row.config);
	}
}
/** Return whether a Loader specifier names an npm package. */
function isBarePackageSpecifier(name) {
	return !name.startsWith(".") && !name.startsWith("/") && !name.startsWith("#") && !URL.canParse(name);
}
/** Return whether a package is a user-facing Client UI extension, not a Host provider. */
function isOptionalClientPackage(name) {
	return /^(@[^/]+\/)?dsh-client-ui-/u.test(name);
}
/** Drop unresolved optional Client UI rows from the machine-wide patch only. */
function omitUnresolvedOptionalEntries(patches, profilePackageUrl) {
	const skipped = [];
	const installPackageUrl = pathToFileURL(INSTALL_ANCHOR).href;
	const filterRows = (rows) => {
		const filtered = [];
		for (const row of rows) {
			if (typeof row.name === "string" && isBarePackageSpecifier(row.name) && isOptionalClientPackage(row.name) && findOverlayPackage(row.name, {
				installPackageUrl,
				profilePackageUrl
			}) === void 0) {
				skipped.push({
					...typeof row.id === "string" ? { id: row.id } : {},
					name: row.name
				});
				continue;
			}
			const config = row.group === true && Array.isArray(row.config) ? filterRows(row.config) : void 0;
			filtered.push(config === void 0 ? row : {
				...row,
				config
			});
		}
		return filtered;
	};
	return {
		patches: patches.flatMap((patch) => {
			if (!Array.isArray(patch.insert)) return [patch];
			const insert = filterRows(patch.insert);
			return [{
				...patch,
				insert
			}];
		}),
		skipped
	};
}
/** Return whether one Loader row claims either Desktop-owned Market identity. */
function isMarketProviderEntry(entry) {
	return typeof entry.id === "string" && MARKET_ROW_IDS.has(entry.id) || typeof entry.name === "string" && MARKET_PACKAGE_NAMES.has(entry.name);
}
/** Remove provider rows recursively before an untrusted patch can activate either implementation. */
function filterMarketProviderRows(rows, matches = isMarketProviderEntry) {
	const filtered = [];
	let removedProviderReference = false;
	for (const row of rows) {
		if (matches(row)) {
			removedProviderReference = true;
			continue;
		}
		if (row.group === true && Array.isArray(row.config)) {
			const nested = filterMarketProviderRows(row.config, matches);
			removedProviderReference ||= nested.removedProviderReference;
			filtered.push(nested.removedProviderReference ? {
				...row,
				config: nested.rows
			} : row);
		} else filtered.push(row);
	}
	return {
		rows: filtered,
		removedProviderReference
	};
}
/** Strip provider inserts and overrides from every non-provider layer. */
function filterMarketProviderPatches(patches, matches = isMarketProviderEntry) {
	const filtered = [];
	let removedProviderReference = false;
	for (const patch of patches) {
		if (matches(patch)) {
			removedProviderReference = true;
			continue;
		}
		if (Array.isArray(patch.insert)) {
			const insert = filterMarketProviderRows(patch.insert, matches);
			removedProviderReference ||= insert.removedProviderReference;
			filtered.push(insert.removedProviderReference ? {
				...patch,
				insert: insert.rows
			} : patch);
		} else filtered.push(patch);
	}
	return {
		patches: filtered,
		removedProviderReference
	};
}
/** AA is an optional bundle; user layers cannot bypass its Desktop selection. */
function isAaEntry(entry) {
	return entry.id === AA_ROW_ID || entry.name === AA_PACKAGE_NAME || typeof entry.name === "string" && entry.name.startsWith(`${AA_PACKAGE_NAME}/`);
}
/** Accept only the audited single-row contract from the selected direct bundle layer. */
function validateDshMarketBundlePatches(patches) {
	const rows = composeEntries([[...patches]]);
	const row = rows[0];
	if (rows.length !== 1 || row === void 0 || row.id !== DESKTOP_MARKET_IDENTITIES.dshMarket.rowId || row.name !== DESKTOP_MARKET_IDENTITIES.dshMarket.packageName || Object.keys(row).some((key) => key !== "id" && key !== "name")) throw new Error(`${BIN_NAME}: dshmarket bundle patch must insert exactly the canonical dsh-market row`);
}
/** Ensure a Desktop dependency is resolvable through the selected profile fallback. */
function validateMarketPackage(name, profilePackageUrl) {
	try {
		resolveOverlayPackage(name, {
			installPackageUrl: pathToFileURL(INSTALL_ANCHOR).href,
			profilePackageUrl
		});
	} catch (cause) {
		return `${BIN_NAME}: cannot resolve selected Market package ${name}: ${marketFailureMessage(cause)}`;
	}
}
/** Assert the final graph contains only the provider selected by the launcher. */
function assertEffectiveMarketRows(rows, effective) {
	const providers = rows.filter(isMarketProviderEntry);
	if (effective === "disabled") {
		if (providers.length !== 0) throw new Error(`${BIN_NAME}: disabled Market provider leaked into the Loader graph`);
		return;
	}
	const identity = effective === DESKTOP_MARKET_IDENTITIES.community.provider ? DESKTOP_MARKET_IDENTITIES.community : DESKTOP_MARKET_IDENTITIES.dshMarket;
	if (providers.length !== 1 || providers[0]?.id !== identity.rowId || providers[0]?.name !== identity.packageName) throw new Error(`${BIN_NAME}: selected Market provider did not compose to one canonical Loader row`);
}
/**
* Read the Desktop machine-wide patch without relaxing upstream patch parsing.
*
* A YAML null document is the natural result of an empty, comment-only, or
* explicit `null` file. Desktop treats only that machine-wide state as an
* empty patch layer; every non-null document still goes through app-boot's
* strict parser, including its `!!js` schema and diagnostics.
*/
function loadDesktopMachinePatches(home) {
	const path = join(home, PROFILE_PATCH_FILENAME);
	let content;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		return loadOptionalPatches(BIN_NAME, path) ?? [];
	}
	try {
		const documents = parseAllDocuments(content, { prettyErrors: true });
		if (documents.length === 0) return [];
		const [document] = documents;
		if (documents.length === 1 && document !== void 0 && document.errors.length === 0 && document.warnings.length === 0 && document.toJS() === null) return [];
	} catch {}
	return loadOptionalPatches(BIN_NAME, path) ?? [];
}
/**
* Load and compose one desktop profile generation.
* @param telemetryDisabled - inherited DSH telemetry opt-out value.
* @param home - Harness home containing profiles and the machine-wide patch.
* @param platform - native platform selecting launcher-owned safety overlays.
* @param profileName - existing or lazily available Web profile to compose.
* @param pluginStatePath - optional Desktop-private disabled-bundle state.
* @param marketSelection - machine-level provider request fixed for this generation.
* @returns root config, profile metadata, and ordered patches.
*/
function prepareDesktopProfile(telemetryDisabled = process.env.DSH_TELEMETRY_DISABLED, home = resolveDshHome(), platform = process.platform, profileName = DESKTOP_PROFILE_NAME, pluginStatePath, marketSelection = DEFAULT_DESKTOP_MARKET_SNAPSHOT, hooks = {}) {
	marketSelection = { requested:"disabled", effective:"disabled", legacyDefaulted:false };
	hooks = { ...hooks, aaEnabled:false };
	const lanAddresses = preparedLanAddresses(hooks.lanAddresses);
	const profileDir = profileName === "desktop" ? ensureDesktopProfile(home) : resolveProfileDir(profileName, home);
	const requiresDependencyMigration = profileDependencyMigrationRequired(profileDir, reconcileProfilePnpmWorkspace(profileDir), platform);
	const managedDisabledBundles = pluginStatePath === void 0 ? /* @__PURE__ */ new Set() : readDesktopDisabledBundles(pluginStatePath, profileName);
	const disabledBundles = marketSelection.requested === DESKTOP_MARKET_IDENTITIES.community.provider ? new Set(managedDisabledBundles) : /* @__PURE__ */ new Set();
	const loadedProfile = loadRecoveryFilteredProfile(profileName, profileDir, disabledBundles, marketSelection.requested, hooks.aaEnabled === true);
	const profile = hooks.profilePatches === void 0 ? loadedProfile.profile : {
		...loadedProfile.profile,
		patches: structuredClone([...hooks.profilePatches])
	};
	const rootConfig = join(profileDir, DESKTOP_PROFILE_ROOT);
	const bareModuleBaseUrl = pathToFileURL(join(profile.dir, "package.json")).href;
	if (!existsSync(rootConfig) || readFileSync(rootConfig, "utf8") !== "[]\n") writeFileSync(rootConfig, "[]\n");
	const desktopPatches = loadOverlayPatches(BIN_NAME, DESKTOP_PATCH_PATH);
	const bundlePatches = [];
	let aaLayer;
	let dshMarketPatches;
	let desktopLayerInserted = false;
	const providerAwareDisabledBundles = new Set(disabledBundles);
	if (marketSelection.requested === DESKTOP_MARKET_IDENTITIES.dshMarket.provider) providerAwareDisabledBundles.delete(DESKTOP_MARKET_IDENTITIES.dshMarket.packageName);
	if (hooks.aaEnabled === true) providerAwareDisabledBundles.delete(AA_PACKAGE_NAME);
	for (const layer of activeDesktopProfileLayers(profile, providerAwareDisabledBundles)) {
		if (layer.packageName === AA_PACKAGE_NAME) {
			aaLayer = layer;
			continue;
		}
		if (layer.packageName === DESKTOP_MARKET_IDENTITIES.dshMarket.packageName) {
			dshMarketPatches = layer.patches;
			continue;
		}
		bundlePatches.push(...layer.patches);
		if (layer.packageName !== "@deepseek-ai/dsh-web-app") continue;
		bundlePatches.push(...desktopPatches);
		desktopLayerInserted = true;
	}
	if (!desktopLayerInserted) throw new Error(`${BIN_NAME}: desktop profile is missing @deepseek-ai/dsh-web-app`);
	const { patches: homePatches, skipped: skippedOptionalEntries } = omitUnresolvedOptionalEntries(loadDesktopMachinePatches(home), bareModuleBaseUrl);
	const filteredBundles = filterMarketProviderPatches(bundlePatches);
	const filteredProfile = filterMarketProviderPatches(profile.patches);
	const filteredHome = filterMarketProviderPatches(homePatches);
	const hasProviderConflict = filteredBundles.removedProviderReference || filteredProfile.removedProviderReference || filteredHome.removedProviderReference;
	let effectiveMarket = "disabled";
	let marketFailure;
	const providerPatches = [];
	if (marketSelection.requested !== "disabled") if (hasProviderConflict) marketFailure = `${BIN_NAME}: conflicting Market provider Loader identity was removed`;
	else if (marketSelection.requested === DESKTOP_MARKET_IDENTITIES.community.provider) {
		marketFailure = validateMarketPackage(DESKTOP_MARKET_IDENTITIES.community.packageName, bareModuleBaseUrl);
		if (marketFailure === void 0) {
			providerPatches.push({ insert: [{
				id: DESKTOP_MARKET_IDENTITIES.community.rowId,
				name: DESKTOP_MARKET_IDENTITIES.community.packageName
			}] });
			effectiveMarket = DESKTOP_MARKET_IDENTITIES.community.provider;
		}
	} else if (loadedProfile.dshMarketFailure !== void 0) marketFailure = loadedProfile.dshMarketFailure;
	else if (dshMarketPatches === void 0) marketFailure = `${BIN_NAME}: selected dshmarket bundle layer is unavailable`;
	else try {
		validateDshMarketBundlePatches(dshMarketPatches);
		providerPatches.push(...dshMarketPatches);
		effectiveMarket = DESKTOP_MARKET_IDENTITIES.dshMarket.provider;
	} catch (cause) {
		marketFailure = marketFailureMessage(cause);
	}
	const ordinary = filterMarketProviderPatches([
		...filteredBundles.patches,
		...providerPatches,
		...filteredProfile.patches,
		...filteredHome.patches
	], isAaEntry);
	const aaPatches = [];
	let aaFailure = loadedProfile.aaFailure;
	if (hooks.aaEnabled === true && aaFailure === void 0) try {
		if (ordinary.removedProviderReference) throw new Error("conflicting AA configuration was removed");
		if (!aaLayer) throw new Error("selected AA bundle layer is unavailable");
		const aaRows = composeEntries([aaLayer.patches]);
		const aaRow = aaRows.find((row) => row.id === AA_ROW_ID && row.name === AA_PACKAGE_NAME);
		if (!aaRow || aaRows.length !== 1 || aaRow.disabled === true) throw new Error("AA bundle must contain one active canonical plugin entry");
		const connectorSourceDir = join(aaLayer.packageDir, "lib", "bundled-connector").replace(/([\\/])app\.asar([\\/])/u, "$1app.asar.unpacked$2");
		if (!existsSync(join(connectorSourceDir, "pyproject.toml"))) throw new Error("AA Connector payload is unavailable");
		aaPatches.push(...aaLayer.patches, {
			id: AA_ROW_ID,
			config: {
				...rowConfig(aaRow),
				dshHome: home,
				connectorSourceDir
			}
		});
	} catch (cause) {
		aaFailure = marketFailureMessage(cause);
	}
	const patches = [...ordinary.patches, ...aaPatches];
	const composedRows = composeEntries([patches]);
	assertUniqueEntryIds(composedRows);
	assertEffectiveMarketRows(composedRows, effectiveMarket);
	const rows = /* @__PURE__ */ new Map();
	for (const row of composedRows) if (typeof row.id === "string") rows.set(row.id, row);
	if (rows.get("settings")?.name !== SETTINGS_PACKAGE) throw new Error(`${BIN_NAME}: desktop profile must use ${SETTINGS_PACKAGE} in the settings row`);
	const settingsSpec = resolveDesktopSettingsDocument({ dshHome: home });
	const settingsDocument = settingsSpec.filename;
	migrateDesktopSettingsDocumentSections(settingsSpec);
	hooks.onSettingsDocumentResolved?.(settingsDocument);
	const desktopShell = rows.get("desktop-shell");
	if (desktopShell === void 0) throw new Error(`${BIN_NAME}: desktop profile has no desktop-shell row`);
	const desktopShellConfig = { ...rowConfig(desktopShell), networkExposure:"loopback", openBrowser:false };
	const pendingSection = pendingDesktopShellSection(settingsSpec);
	if (pendingSection !== void 0 && hooks.profilePatches === void 0 && pendingDesktopShellConfig(desktopShellConfig, pendingSection, platform) !== void 0 && importPendingDesktopShellSection(profile.patchPath, desktopShell.name, settingsSpec, pendingSection)) return prepareDesktopProfile(telemetryDisabled, home, platform, profileName, pluginStatePath, marketSelection, hooks);
	const { mode, port, macosMaterial, windowsMaterial, linuxMaterial, openBrowser, networkExposure } = desktopStartupSettingsFromSettings({ [DESKTOP_SETTINGS_NAMESPACE]: desktopShellConfig });
	const webRuntime = rows.get("web-runtime");
	if (webRuntime === void 0) throw new Error(`${BIN_NAME}: desktop profile has no web-runtime row`);
	const webRuntimeConfig = rowConfig(webRuntime);
	const desktopTrustedHosts = webRuntimeTrustedHosts(webRuntimeConfig.trustedHosts, lanAddresses);
	patches.push({
		id: "web-runtime",
		config: {
			...webRuntimeConfig,
			openBrowser: false,
			trustedHosts: desktopTrustedHosts
		}
	});
	const connectionPatch = connectionTrustPatch(rows.get("connection"), desktopTrustedHosts);
	if (connectionPatch !== void 0) patches.push(connectionPatch);
	if (mode === "advanced" || mode === "extended") {
		for (const [id, packageName] of [
			["ui-layout", UI_LAYOUT_PACKAGE],
			["ui-sidebar", UI_SIDEBAR_PACKAGE],
			["ui-conversation", UI_CONVERSATION_PACKAGE]
		]) if (rows.get(id)?.name !== packageName) throw new Error(`${BIN_NAME}: ${mode} desktop mode must use ${packageName} in the ${id} row`);
	}
	const layoutMode = hooks.generationMode ?? mode;
	if (layoutMode === "advanced" || layoutMode === "extended") patches.push({
		id: "ui-layout",
		disabled: true
	}, {
		id: "ui-sidebar",
		disabled: false
	}, {
		id: "ui-conversation",
		disabled: false
	});
	const webserver = rows.get("webserver");
	if (webserver === void 0) throw new Error(`${BIN_NAME}: desktop profile has no webserver row`);
	if (platform === "win32") {
		if (!rows.has(DIRECTORY_PICKER_ROW_ID)) throw new Error(`${BIN_NAME}: desktop profile has no directory-picker row`);
		patches.push({
			id: DIRECTORY_PICKER_ROW_ID,
			name: AUTO_PICKER_PACKAGE,
			disabled: true
		}, { insert: [{
			id: "desktop-directory-picker-browse-host",
			name: BROWSE_PICKER_BACKEND
		}, {
			id: "desktop-directory-picker-browse-surface",
			name: BROWSE_PICKER_SURFACE
		}] });
		const pwshSandbox = rows.get(PWSH_SANDBOX_ROW_ID);
		if (pwshSandbox?.name === UPSTREAM_PWSH_SANDBOX_PACKAGE && !rowDisabledOnPlatform(pwshSandbox, platform)) patches.push({
			id: PWSH_SANDBOX_ROW_ID,
			name: UPSTREAM_PWSH_SANDBOX_PACKAGE,
			disabled: true
		}, { insert: [{
			id: DESKTOP_WINDOWS_PWSH_SANDBOX_ROW_ID,
			name: DESKTOP_WINDOWS_PWSH_SANDBOX_PACKAGE,
			...pwshSandbox.disabled === void 0 ? {} : { disabled: pwshSandbox.disabled },
			config: rowConfig(pwshSandbox)
		}] });
	}
	const webserverConfig = {
		host: desktopWebServerHost(networkExposure),
		port
	};
	if (webserver.name === DESKTOP_WEB_SERVER_PACKAGE) patches.push({
		id: "webserver",
		name: DESKTOP_WEB_SERVER_PACKAGE,
		disabled: false,
		config: webserverConfig
	});
	else {
		if (typeof webserver.name !== "string") throw new Error(`${BIN_NAME}: desktop profile webserver row has no package identity`);
		const replacement = rows.get(DESKTOP_WEB_SERVER_ROW_ID);
		if (replacement !== void 0 && replacement.name !== DESKTOP_WEB_SERVER_PACKAGE) throw new Error(`${BIN_NAME}: reserved ${DESKTOP_WEB_SERVER_ROW_ID} row has a conflicting package identity`);
		patches.push({
			id: "webserver",
			name: webserver.name,
			disabled: true
		});
		if (replacement === void 0) patches.push({ insert: [{
			id: DESKTOP_WEB_SERVER_ROW_ID,
			name: DESKTOP_WEB_SERVER_PACKAGE,
			config: webserverConfig
		}] });
		else patches.push({
			id: DESKTOP_WEB_SERVER_ROW_ID,
			name: DESKTOP_WEB_SERVER_PACKAGE,
			disabled: false,
			config: webserverConfig
		});
	}
	if ((telemetryDisabled ?? "") !== "" && rows.has("session-telemetry-otel")) patches.push({
		id: "session-telemetry-otel",
		disabled: true
	});
	for (const id of UPSTREAM_PRODUCT_ANALYTICS_ROW_IDS) if (rows.has(id)) patches.push({
		id,
		disabled: true
	});
	patches.push({
		id: "desktop-shell",
		disabled: false
	});
	return {
		homeDir: home,
		reloadOptions: {
			telemetryDisabled,
			platform,
			profileName,
			pluginStatePath,
			marketSelection: structuredClone(marketSelection),
			aaEnabled: hooks.aaEnabled === true
		},
		profile,
		rootConfig,
		bareModuleBaseUrl,
		patches: [{ insert: petDesktopEntries(composeEntries([patches])) }],
		skippedOptionalEntries,
		mode,
		port,
		macosMaterial,
		windowsMaterial,
		linuxMaterial,
		openBrowser,
		networkExposure,
		lanAddresses,
		settingsDocument,
		aaEnabled: aaPatches.length > 0,
		...aaFailure === void 0 ? {} : { aaFailure },
		market: desktopMarketSnapshotWithEffective(marketSelection, effectiveMarket),
		requiresDependencyMigration,
		...marketFailure === void 0 ? {} : { marketFailure }
	};
}
/**
* Retire the upstream module fallback for one fully resolved Desktop profile.
*
* dsh 0.1.7-alpha.1 deleted `healProfilesModuleFallback`: profile-local packages are
* served by the runtime resolution table instead of a materialized link tree, so there
* is no fallback left to heal. All this can still usefully do is sweep the tree older
* Desktop releases wrote. Upstream runs that sweep (`removeLinkProjections`) inside
* `loadProfile`, but Desktop composes profiles through {@link loadRecoveryFilteredProfile}
* and never calls `loadProfile`, so this is the only place a Desktop install cleans up
* after an upgrade. It uses {@link removeLinkProjectionsSafely}: the upstream helper's
* recursive `rmSync` follows the projection junctions under Electron 44 and empties the
* installation packages they point to.
*
* NOTE FOR FUTURE WORK: if Desktop ever needs to re-materialize a link tree of its own,
* it must NOT reuse the directory name `.dsh-module-fallback`. 0.1.7's `loadProfile`
* calls `removeLinkProjections` on every load and would delete it out from under us.
*
* The name and signature are byte-compared against the stable edition's caller in
* `main.ts`, so only the body may change.
* @param home - Harness home whose profile directories are swept.
* @param profile - the resolved profile, when one is already loaded.
*/
async function healDesktopProfileModuleFallback(home, profile) {
	await Promise.resolve();
	if (profile !== void 0) {
		removeLinkProjectionsSafely(profile.dir);
		return;
	}
	const profilesDir = join(home, PROFILES_DIR);
	let entries;
	try {
		entries = readdirSync(profilesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(profilesDir, entry.name));
	} catch (cause) {
		if (cause.code === "ENOENT") return;
		throw cause;
	}
	for (const dir of entries) removeLinkProjectionsSafely(dir);
}
/** Expose the package anchor for focused resolution tests. */
function desktopInstallAnchor() {
	return INSTALL_ANCHOR;
}
//#endregion
export { validateDshMarketBundlePatches as C, cleanupDisposableTree as D, selectDesktopMarketProvider as E, syncDesktopManagedProfileBundles as S, readDesktopMarketStateForUserData as T, readDesktopOfficialPluginMarketEnabled as _, configureDesktopOfficialPluginMarket as a, resolveDesktopSettingsDocument as b, desktopShellModeFromSettings as c, healDesktopProfileModuleFallback as d, migrateDesktopSettingsDocumentSections as f, readDesktopManagedProfileBundles as g, prepareDesktopProfile as h, UPSTREAM_PRODUCT_ANALYTICS_ROW_IDS as i, desktopStartupSettingsFromSettings as l, parseDesktopShellMode as m, DESKTOP_PROFILE_NAME as n, desktopBundleList as o, parseDesktopPort as p, DESKTOP_PROFILE_ROOT as r, desktopInstallAnchor as s, DEFAULT_OFFICIAL_MARKET_INDEX_URL as t, ensureDesktopProfile as u, readDesktopShellMode as v, desktopMarketSnapshotWithEffective as w, shippedSkillRoot as x, readDesktopStartupSettings as y };

//# sourceMappingURL=profile-BePNPvSL.js.map