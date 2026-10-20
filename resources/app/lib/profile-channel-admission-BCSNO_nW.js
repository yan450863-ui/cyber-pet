import { c as OTHER_DESKTOP_PRODUCT_IDENTITY, i as DESKTOP_PRODUCT_IDENTITY, n as DESKTOP_PACKAGE_NAME } from "./product-identity-DUPfNg4Q.js";
import { n as parseDesktopPlatformLoginRequest } from "./platform-login-BFKNMEcY.js";
import { i as diagnosticOperation, n as developerLoggingEnabled, r as diagnosticLog } from "./developer-logging-CZcXvx4-.js";
import { r as shouldEmit } from "./log-files-CJwv9eE8.js";
import { d as parseSemVer } from "./update-checker-CND31yfF.js";
import "node:module";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { auditStartupEntries } from "@deepseek-ai/dsh-app-boot";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { Logger, Service } from "@deepseek-ai/cordis";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region src/host-rpc.ts
/** Private, asynchronous control channel. Web traffic never passes through this channel. */
var HostRpc = class {
	port;
	timeoutMs;
	sequence = 0;
	closed = false;
	pending = /* @__PURE__ */ new Map();
	active = /* @__PURE__ */ new Map();
	handlers = /* @__PURE__ */ new Map();
	unlisten;
	constructor(port, timeoutMs = 3e4) {
		this.port = port;
		this.timeoutMs = timeoutMs;
		this.unlisten = port.listen((message) => {
			this.receive(message);
		});
	}
	handle(name, handler) {
		if (this.handlers.has(name)) throw new Error(`Duplicate Host handler: ${name}`);
		this.handlers.set(name, handler);
		return () => {
			this.handlers.delete(name);
		};
	}
	call(method, args = [], signal, timeoutMs = this.timeoutMs) {
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("DSH Host channel closed"));
		if (signal?.aborted) return Promise.reject(/* @__PURE__ */ new Error("DSH Host call cancelled"));
		const id = ++this.sequence;
		const end = diagnosticOperation("process.ipc", "call", {
			method,
			requestId: id
		});
		return new Promise((settle, fail) => {
			const resolve = (value) => {
				end();
				settle(value);
			};
			const reject = (error) => {
				end(error);
				fail(error);
			};
			const abort = () => {
				this.pending.delete(id);
				cleanup();
				try {
					this.port.send({
						kind: "cancel",
						id
					});
				} catch {}
				reject(/* @__PURE__ */ new Error("DSH Host call cancelled or timed out"));
			};
			const timer = timeoutMs === 0 ? void 0 : setTimeout(abort, timeoutMs);
			const cleanup = () => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
			};
			this.pending.set(id, {
				resolve,
				reject,
				cleanup
			});
			signal?.addEventListener("abort", abort, { once: true });
			try {
				this.port.send({
					kind: "call",
					id,
					method,
					args
				});
			} catch (cause) {
				this.pending.delete(id);
				cleanup();
				reject(cause instanceof Error ? cause : new Error(String(cause)));
			}
		});
	}
	close(reason = "DSH Host channel closed") {
		if (this.closed) return;
		this.closed = true;
		this.unlisten();
		for (const item of this.pending.values()) {
			item.cleanup();
			item.reject(new Error(reason));
		}
		this.pending.clear();
		for (const controller of this.active.values()) controller.abort();
		this.active.clear();
		this.handlers.clear();
	}
	async receive(value) {
		if (this.closed || !value || typeof value !== "object") return;
		const message = value;
		if (!Number.isSafeInteger(message.id) || message.id < 1) return;
		const id = message.id;
		if (message.kind === "result") {
			const pending = this.pending.get(id);
			if (!pending) return;
			this.pending.delete(id);
			pending.cleanup();
			if (typeof message.error === "string") pending.reject(new Error(message.error));
			else pending.resolve(message.value);
		} else if (message.kind === "cancel") this.active.get(id)?.abort();
		else if (message.kind === "call" && typeof message.method === "string" && Array.isArray(message.args)) {
			const end = diagnosticOperation("process.ipc", "handle", {
				method: message.method,
				requestId: id
			});
			const controller = new AbortController();
			this.active.set(id, controller);
			try {
				const handler = this.handlers.get(message.method);
				if (!handler) throw new Error(`Unknown Host operation: ${message.method}`);
				const result = await handler(message.args, controller.signal);
				end(void 0, { cancelled: controller.signal.aborted });
				if (!this.closed) this.port.send({
					kind: "result",
					id,
					value: result
				});
			} catch (cause) {
				end(cause, { cancelled: controller.signal.aborted });
				if (!this.closed) try {
					this.port.send({
						kind: "result",
						id,
						error: cause instanceof Error ? cause.message : String(cause)
					});
				} catch {}
			} finally {
				this.active.delete(id);
			}
		}
	}
};
//#endregion
//#region src/host-runtime-bridge.ts
function runtimeSnapshot(runtime) {
	const { isPackaged, canDownload, currentVersion, releaseChannel, statePath, installationId } = runtime.updates;
	return {
		platform: runtime.platform,
		locale: runtime.locale,
		updates: {
			isPackaged,
			canDownload,
			currentVersion,
			statePath,
			...releaseChannel ? { releaseChannel } : {},
			...installationId ? { installationId } : {}
		}
	};
}
/** Keep functions in their owning process and send snapshots plus opaque callback IDs. */
function createHostRuntime(rpc, snapshot) {
	let sequence = 0;
	let locale = snapshot.locale;
	const calls = /* @__PURE__ */ new Set();
	const setup = [];
	let booting = true;
	const trayPublishers = /* @__PURE__ */ new Map();
	const trackSetup = (task) => {
		if (booting) setup.push(task);
	};
	const shellSpecs = /* @__PURE__ */ new Map();
	const send = (method, args = [], signal) => {
		const interactive = [
			"update:confirmDownload",
			"update:showManualCheckResult",
			"update:downloadAndOpen",
			"native:pickDirectory",
			"native:exportDiagnostics"
		].includes(method);
		const task = rpc.call(method, args, signal, interactive ? 0 : void 0);
		calls.add(task);
		task.then(() => calls.delete(task), (error) => {
			calls.delete(task);
			process.stderr.write(`${String(error)}\n`);
		});
		return task;
	};
	const callbacks = (handlers) => {
		const id = `callback:${++sequence}`;
		const releases = Object.entries(handlers).map(([name, handler]) => rpc.handle(`${id}:${name}`, (args) => handler(...args)));
		return {
			id,
			release: () => releases.forEach((dispose) => dispose())
		};
	};
	let localeSync = Promise.resolve();
	const syncLocale = (preference) => {
		localeSync = localeSync.catch(() => {}).then(async () => {
			locale = await send("native:setLocalePreference", [preference]);
			await Promise.all([...trayPublishers.values()].map((publish) => publish()));
		});
		return localeSync;
	};
	return {
		platform: snapshot.platform,
		get locale() {
			return locale;
		},
		updates: {
			...snapshot.updates,
			request: async (url, init) => {
				const { signal, ...options } = init;
				const response = await send("update:request", [url, {
					...options,
					headers: [...new Headers(init.headers).entries()]
				}], signal ?? void 0);
				return new Response([
					204,
					205,
					304
				].includes(response.status) ? null : response.body, {
					status: response.status,
					headers: response.headers
				});
			},
			confirmDownload: (version, channel) => send("update:confirmDownload", [version, channel]),
			showManualCheckResult: (result) => send("update:showManualCheckResult", [result]),
			downloadAndOpen: (version, signal, channel) => send("update:downloadAndOpen", [version, channel], signal),
			notify: (notification) => {
				send("update:notify", [notification]);
			}
		},
		schedule(spec) {
			const callback = callbacks({
				quit: spec.requestQuit,
				mode: spec.requestModeChange,
				...spec.readRemoteControl ? { remoteRead: spec.readRemoteControl } : {},
				...spec.enableRemoteControl ? { remoteEnable: spec.enableRemoteControl } : {},
				...spec.applySetupSettings ? { setup: spec.applySetupSettings } : {}
			});
			const { readLocalePreference, readThemeSource, requestQuit: _quit, requestModeChange: _mode, readRemoteControl: _remoteRead, enableRemoteControl: _remoteEnable, applySetupSettings: _setup, ...data } = spec;
			shellSpecs.set(callback.id, spec);
			trackSetup(send("shell:schedule", [
				callback.id,
				data,
				readLocalePreference(),
				readThemeSource(),
				Boolean(spec.readRemoteControl && spec.enableRemoteControl),
				Boolean(spec.applySetupSettings)
			]));
			return async () => {
				try {
					await send("shell:dispose", [callback.id]);
				} finally {
					shellSpecs.delete(callback.id);
					callback.release();
				}
			};
		},
		async mountScheduled() {
			await Promise.all(setup);
			setup.length = 0;
			booting = false;
			for (const [id, spec] of shellSpecs) {
				const preference = spec.readLocalePreference();
				await syncLocale(preference);
				await send("shell:preferences", [
					id,
					preference,
					spec.readThemeSource()
				]);
			}
		},
		registerTrayItem(item) {
			const id = `tray:${++sequence}`;
			let releases = [];
			const publish = () => {
				for (const release of releases) release();
				releases = [];
				const project = (entry, index) => {
					const method = `${id}:${index}`;
					releases.push(rpc.handle(method, () => entry.invoke()));
					return {
						label: entry.label(),
						enabled: entry.enabled?.() ?? true,
						checked: "checked" in entry ? entry.checked?.() ?? false : false,
						type: "type" in entry ? entry.type : void 0,
						method
					};
				};
				const task = send("tray:set", [id, {
					...project(item, -1),
					group: item.group,
					order: item.order,
					id: item.id,
					submenu: item.submenu?.().map((entry, index) => project(entry, index))
				}]);
				trackSetup(task);
				return task;
			};
			trayPublishers.set(id, publish);
			publish();
			return {
				refresh: publish,
				dispose() {
					trayPublishers.delete(id);
					releases.forEach((release) => release());
					send("tray:dispose", [id]);
				}
			};
		},
		configureDeveloperLogging(preferences) {
			send("native:configureDeveloperLogging", [preferences]);
		},
		show() {
			send("native:show");
		},
		notifyAttention(value) {
			send("native:notifyAttention", [value]);
		},
		openTerminal() {
			send("native:openTerminal");
		},
		reloadRenderer() {
			send("native:reloadRenderer");
		},
		toggleDeveloperTools() {
			send("native:toggleDeveloperTools");
		},
		exportDiagnostics: () => send("native:exportDiagnostics"),
		pickDirectory: () => send("native:pickDirectory"),
		validateDirectory: (path) => send("native:validateDirectory", [path]),
		platformLogin(request) {
			send("native:platformLogin", [request]);
		},
		reportRendererBoot: (report) => {
			send("native:reportRendererBoot", [report]);
		},
		setLocalePreference(preference) {
			syncLocale(preference).catch((error) => process.stderr.write(`${String(error)}\n`));
		},
		setThemeSource(source) {
			send("native:setThemeSource", [source]);
		},
		requestRestart: () => send("native:requestRestart"),
		requestRecoveryRestart: () => send("native:requestRecoveryRestart"),
		prepareToQuit() {
			send("native:prepareToQuit");
		},
		openProfileCreateWindow(options) {
			const callback = callbacks({
				submit: async (name) => {
					await options.onSubmit(name);
					callback.release();
				},
				cancel: () => {
					options.onCancel?.();
					callback.release();
				}
			});
			send("native:openProfileCreateWindow", [callback.id]);
		}
	};
}
/** Install only the declared native surface; never expose arbitrary Electron APIs. */
function bindNativeRuntime(rpc, runtime) {
	const trays = /* @__PURE__ */ new Map();
	const shells = /* @__PURE__ */ new Map();
	const preferences = /* @__PURE__ */ new Map();
	const releases = [];
	const handle = (name, fn) => {
		releases.push(rpc.handle(name, fn));
	};
	const callback = (method, args = []) => rpc.call(method, args);
	const report = (promise) => {
		promise.catch((error) => process.stderr.write(`${String(error)}\n`));
	};
	for (const method of [
		"show",
		"notifyAttention",
		"openTerminal",
		"reloadRenderer",
		"toggleDeveloperTools",
		"exportDiagnostics",
		"pickDirectory",
		"validateDirectory",
		"reportRendererBoot",
		"setThemeSource",
		"prepareToQuit"
	]) handle(`native:${method}`, (args) => runtime[method].apply(runtime, args));
	handle("native:configureDeveloperLogging", ([preferences]) => {
		if (!preferences || typeof preferences.developerLogging !== "boolean" || ![
			"debug",
			"info",
			"warn",
			"error"
		].includes(preferences.logLevel)) throw new TypeError("Invalid logging preferences");
		runtime.configureDeveloperLogging?.(preferences);
	});
	handle("native:platformLogin", ([request]) => {
		runtime.platformLogin(parseDesktopPlatformLoginRequest(request));
	});
	handle("native:setLocalePreference", ([preference]) => {
		runtime.setLocalePreference(preference);
		return runtime.locale;
	});
	for (const method of ["requestRestart", "requestRecoveryRestart"]) handle(`native:${method}`, () => {
		setImmediate(() => report(runtime[method]()));
	});
	handle("native:openProfileCreateWindow", ([id]) => runtime.openProfileCreateWindow({
		onSubmit: (name) => callback(`${id}:submit`, [name]),
		onCancel: () => report(callback(`${id}:cancel`))
	}));
	handle("shell:schedule", ([id, data, locale, theme, remoteControl, setupSettings]) => {
		if (shells.has(id)) throw new Error("Duplicate Host shell");
		const state = {
			locale,
			theme
		};
		preferences.set(id, state);
		shells.set(id, runtime.schedule({
			...data,
			readLocalePreference: () => state.locale,
			readThemeSource: () => state.theme,
			requestQuit: (code) => report(callback(`${id}:quit`, [code])),
			requestModeChange: (mode) => callback(`${id}:mode`, [mode]),
			...remoteControl ? {
				readRemoteControl: () => callback(`${id}:remoteRead`),
				enableRemoteControl: () => callback(`${id}:remoteEnable`)
			} : {},
			...setupSettings ? { applySetupSettings: (settings) => callback(`${id}:setup`, [settings]) } : {}
		}));
	});
	handle("shell:preferences", ([id, locale, theme]) => {
		const state = preferences.get(id);
		if (!state) throw new Error("Host shell is unavailable");
		state.locale = locale;
		state.theme = theme;
	});
	handle("shell:dispose", async ([id]) => {
		const dispose = shells.get(id);
		shells.delete(id);
		preferences.delete(id);
		await dispose?.();
	});
	handle("tray:set", ([id, data]) => {
		trays.get(id)?.dispose();
		const project = (entry) => ({
			...entry,
			label: () => entry.label,
			enabled: () => entry.enabled,
			checked: () => entry.checked,
			invoke: () => callback(entry.method)
		});
		trays.set(id, runtime.registerTrayItem({
			...project(data),
			submenu: data.submenu ? () => data.submenu.map(project) : void 0
		}));
	});
	handle("tray:dispose", ([id]) => {
		trays.get(id)?.dispose();
		trays.delete(id);
	});
	handle("update:request", async ([url, init], signal) => {
		const response = await runtime.updates.request(url, {
			...init,
			signal
		});
		return {
			body: await response.text(),
			status: response.status,
			headers: [...response.headers.entries()]
		};
	});
	handle("update:confirmDownload", ([version, channel]) => runtime.updates.confirmDownload(version, channel));
	handle("update:showManualCheckResult", ([result]) => runtime.updates.showManualCheckResult(result));
	handle("update:downloadAndOpen", ([version, channel], signal) => runtime.updates.downloadAndOpen(version, signal, channel));
	handle("update:notify", ([value]) => runtime.updates.notify(value));
	return async () => {
		trays.forEach((tray) => tray.dispose());
		trays.clear();
		await Promise.all([...shells.values()].map((dispose) => dispose()));
		shells.clear();
		preferences.clear();
		releases.forEach((release) => release());
	};
}
//#endregion
//#region src/desktop-office.ts
/** Office skills and bundled authoring dependencies; ported from upstream Desktop's Host composition. */
var desktop_office_exports = /* @__PURE__ */ __exportAll({
	PRIMARY_RUNTIME_INSTALL_NAME: () => PRIMARY_RUNTIME_INSTALL_NAME,
	apply: () => apply,
	desktopPrimaryRuntime: () => desktopPrimaryRuntime,
	name: () => name,
	resolveDesktopOfficeConfig: () => resolveDesktopOfficeConfig
});
/** Loader identity for the application-owned Office composition. */
const name = "desktop-office";
/**
* Installation name under `<home>/dsh-runtimes`. Stable shares `~/.dsh` with the official Desktop,
* and the tool replaces an installation whose manifest differs, so each edition keeps its own directory.
*/
const PRIMARY_RUNTIME_INSTALL_NAME = `${DESKTOP_PACKAGE_NAME}-primary-runtime`;
/**
* Locate the payload of this CPU: beside the packaged application, or the tree `prepare:runtime`
* assembled for a development launch.
* @param location - Shell facts.
* @returns The payload directory and whether the Host requires it.
*/
function desktopPrimaryRuntime(location) {
	const override = (location.environment ?? process.env).DSH_DESKTOP_PRIMARY_RUNTIME_DIR;
	const arch = location.arch ?? process.arch;
	return {
		source: override !== void 0 && override !== "" ? resolve(override) : join(location.packaged ? join(location.resourcesPath, "runtime") : join(location.packageRoot, ".desktop-build", "runtime"), arch, "primary-runtime"),
		required: location.packaged
	};
}
/**
* Resolve the Office composition for one Host start.
* @param runtime - Payload the shell located, or undefined when the shell passed none.
* @param home - DSH home receiving the installation.
* @returns The configuration, or undefined for a development tree whose payload was not prepared.
* @throws For a packaged Host whose payload is missing.
*/
function resolveDesktopOfficeConfig(runtime, home) {
	if (runtime === void 0) return void 0;
	if (!existsSync(join(runtime.source, "runtime.json"))) {
		if (runtime.required) throw new Error(`${DESKTOP_PACKAGE_NAME}: the bundled primary runtime is missing: ${runtime.source}`);
		return;
	}
	return {
		source: runtime.source,
		root: join(home, "dsh-runtimes", PRIMARY_RUNTIME_INSTALL_NAME)
	};
}
/**
* Enable offline Office authoring and structural checks in the Desktop profile.
* @param ctx - Profile scope; child plugins declare their own service requirements.
* @param config - Bundled payload source and installation root.
*/
async function apply() { throw new Error("Office authoring is not included in Cyber Pet");
}
//#endregion
//#region src/file-exporter.ts
function localTimestamp(ts) {
	const d = new Date(ts);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
/** Cordis exporter that forwards formatted messages to a `LogFileSink`. */
var FileExporter = class {
	sink;
	threshold;
	formatters = {};
	maxLength = 10240;
	levels = { default: 3 };
	constructor(sink, threshold = "info") {
		this.sink = sink;
		this.threshold = threshold;
	}
	/** Update the verbosity threshold in place on a hot-reloaded setting change. */
	setThreshold(level) {
		this.threshold = level;
	}
	export(message) {
		if (!shouldEmit(message.type, this.threshold)) return;
		const rendered = this.render(message);
		this.sink.write(message.type, rendered);
		if (developerLoggingEnabled()) diagnosticLog({
			source: `host.kernel.${message.name}`,
			event: "log",
			level: message.type,
			message: rendered,
			developer: true,
			fields: {
				hostTime: message.ts,
				hostSequence: message.sn,
				pluginId: message.fiber?.deref()?.entry?.id
			}
		});
	}
	/** Close the underlying sink (used by tests and shutdown). */
	close() {
		this.sink.close();
	}
	render(message) {
		const level = message.type.charAt(0).toUpperCase();
		const body = Logger.format(this, message);
		return `${localTimestamp(message.ts)} [${level}] [${message.name}] ${body}`;
	}
};
//#endregion
//#region src/agent-error-logging.ts
/** Logger name every recorded failure carries, and the token to grep the logs for. */
const AGENT_ERROR_LOGGER = "dsh-agent-error";
/** Ceiling for the one-line chain summary; the per-level stacks below it carry the rest. */
const MAX_CHAIN_TEXT = 2e3;
/**
* Read a non-empty string `code` without `instanceof`: a `HarnessError` may
* arrive from a separately resolved copy of the kernel packages, and Node
* system errors (`ENOENT`, `ECONNRESET`) expose the same field shape.
* @param value - one level of a cause chain.
* @returns the stable failure code, or undefined when the level carries none.
*/
function codeOf(value) {
	if (typeof value !== "object" || value === null) return void 0;
	try {
		const code = value.code;
		return typeof code === "string" && code.length > 0 ? code : void 0;
	} catch {
		return;
	}
}
/**
* Render one chain level, mirroring the shape of the kernel's `errorChain()`
* (`packages/llm/llm/src/error.ts`) so the persisted text matches the failure
* notice the renderer already showed the user.
* @param value - the level to render.
* @param path - the active recursion path, for cycle detection.
* @param codes - collector for every code seen along the chain.
* @returns the level's message with its members and cause appended.
*/
function renderLevel(value, path, codes) {
	if (path.has(value)) return "<circular cause>";
	path.add(value);
	try {
		const code = codeOf(value);
		if (code !== void 0) codes.add(code);
		if (!(value instanceof Error)) {
			if (typeof value === "object" && value !== null) {
				const descriptor = Object.getOwnPropertyDescriptor(value, "message");
				if (descriptor !== void 0 && "value" in descriptor && typeof descriptor.value === "string") return descriptor.value;
			}
			return String(value);
		}
		const message = value.message === "" ? value.name : value.message;
		const members = value instanceof AggregateError && value.errors.length > 0 ? ` [${value.errors.map((member) => renderLevel(member, path, codes)).join("; ")}]` : "";
		const causeText = value.cause === void 0 || value.cause === null ? "" : renderLevel(value.cause, path, codes);
		return `${message}${members}${causeText === "" || causeText === message ? "" : `: ${causeText}`}`;
	} catch {
		return "<unrenderable value>";
	} finally {
		path.delete(value);
	}
}
/**
* Flatten one reported failure into a bounded single-line summary plus the
* stable codes along its chain. A `HarnessError` keeps its code in a field, so
* neither `message` nor `stack` contains it — only this pass makes a code such
* as `REQUEST_EXTENSION` searchable in the logs.
* @param error - the value reported by `agent/error` (declared `unknown`).
* @returns the capped chain text and its de-duplicated failure codes.
*/
function digestAgentError(error) {
	const codes = /* @__PURE__ */ new Set();
	const rendered = renderLevel(error, /* @__PURE__ */ new Set(), codes);
	return {
		text: rendered.length > MAX_CHAIN_TEXT ? `${rendered.slice(0, MAX_CHAIN_TEXT)}…` : rendered,
		codes: [...codes]
	};
}
/**
* Build the searchable line recorded for one reported agent failure.
*
* Field names are deliberately not written as `code:` or `session:`:
* `maskSecrets()` treats both as secret-shaped names and would replace the
* value that follows with `****`, erasing the two identifiers this line exists
* to expose.
* @param sessionId - the failing agent's session identity.
* @param turn - the turn in which the failure surfaced.
* @param step - the step at which the failure surfaced.
* @param error - the value reported by `agent/error`.
* @returns one masking-safe line carrying the codes and the whole cause chain.
*/
function formatAgentErrorLine(sessionId, turn, step, error) {
	const { text, codes } = digestAgentError(error);
	const tags = codes.length === 0 ? "" : ` [${codes.join(" ")}]`;
	return `agent turn failed (session ${sessionId}, turn ${String(turn)}, step ${String(step)})${tags}: ${text}`;
}
/**
* Record every reported agent failure on the Host logger, so the desktop file
* exporter persists a searchable digest followed by each cause level's stack.
*
* `agent/error` is the only place the live exception is still reachable: the
* `api-session/error` relay flattens it to text for the renderer, and
* `LlmError.failure` drops `cause` altogether. Cordis expands `cause` only for
* a single-argument `logger.error(error)` call, so the digest and the error
* object must be logged as two separate calls.
* @param ctx - the Host context whose logger owns the desktop file exporter.
* @returns a disposer removing the listener; the owning fiber also unloads it.
*/
function installAgentErrorLogging(ctx) {
	const logger = ctx.logger(AGENT_ERROR_LOGGER);
	return ctx.on("agent/error", ({ agent, turn, step, error }) => {
		try {
			logger.error(formatAgentErrorLine(String(agent.id), turn, step, error));
			if (error instanceof Error) logger.error(error);
		} catch {}
	});
}
//#endregion
//#region src/system-proxy.ts
/**
* URLs probed against the system proxy resolver.
*
* Three, not one: a PAC script may route HTTPS and HTTP differently, and the npm registry is the
* origin package installs use, which enterprise configurations often exempt or redirect on its own.
*/
const PROBE_URLS = Object.freeze([
	"https://api.deepseek.com/",
	"https://registry.npmjs.org/",
	"http://api.deepseek.com/"
]);
/** Proxy names read to decide whether the user configured one explicitly. */
const EXPLICIT_PROXY_ENV_NAMES = Object.freeze([
	"http_proxy",
	"HTTP_PROXY",
	"https_proxy",
	"HTTPS_PROXY",
	"all_proxy",
	"ALL_PROXY"
]);
/** PAC proxy types that carry traffic this package cannot route over Node's HTTP transport. */
const UNROUTABLE_PAC_TYPES = /* @__PURE__ */ new Set([
	"SOCKS",
	"SOCKS4",
	"SOCKS5",
	"SOCKS5H",
	"QUIC"
]);
/**
* A bare `host:port` authority, bracketed for IPv6. The port is required: matching it here rather
* than reading `URL.port` keeps an explicit `:443` on an `HTTPS` entry, which `URL` would normalize
* away as the scheme default.
*/
const PAC_AUTHORITY_PATTERN = /^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9._-]+):\d{1,5}$/u;
/** Accept only a bare `host:port` authority, so a malformed PAC answer never becomes a proxy URL. */
function proxyUrlFromAuthority(scheme, authority) {
	if (!PAC_AUTHORITY_PATTERN.test(authority)) return void 0;
	let parsed;
	try {
		parsed = new URL(`${scheme}://${authority}`);
	} catch {
		return;
	}
	if (parsed.hostname === "") return void 0;
	return `${scheme}://${authority}`;
}
/**
* Read one `session.resolveProxy` answer.
*
* The answer is a PAC result string — `DIRECT`, `PROXY host:port`, or several of those joined by
* `;` as failover candidates. Entries are taken in order and the first routable one wins, so a
* `SOCKS5 127.0.0.1:7891;PROXY 127.0.0.1:7890` configuration lands on the HTTP port rather than
* giving up. Failover past the first routable entry is not modelled: undici holds one proxy per
* scheme, and a proxy that is down is a condition the user must fix either way.
*
* @param pac - the raw string `resolveProxy` resolved with.
* @returns the direct verdict, the proxy URL to use, or why nothing here was usable.
*/
function parsePacProxyResult(pac) {
	const rejected = [];
	for (const entry of pac.split(";")) {
		const trimmed = entry.trim();
		if (trimmed === "") continue;
		const separator = trimmed.search(/\s/u);
		const type = (separator === -1 ? trimmed : trimmed.slice(0, separator)).toUpperCase();
		const authority = separator === -1 ? "" : trimmed.slice(separator + 1).trim();
		if (type === "DIRECT") return { kind: "direct" };
		if (type === "PROXY" || type === "HTTPS") {
			const url = proxyUrlFromAuthority(type === "HTTPS" ? "https" : "http", authority);
			if (url !== void 0) return {
				kind: "proxy",
				url
			};
			rejected.push(`unparseable ${type} entry ${JSON.stringify(trimmed)}`);
			continue;
		}
		if (UNROUTABLE_PAC_TYPES.has(type)) {
			rejected.push(`${type} (${authority})`);
			continue;
		}
		rejected.push(`unrecognized entry ${JSON.stringify(trimmed)}`);
	}
	if (rejected.length === 0) return { kind: "direct" };
	return {
		kind: "unsupported",
		detail: rejected.join(", ")
	};
}
/** Join bypass entries into the one string undici and the policy both read. */
function mergeNoProxy(entries) {
	const merged = entries.flatMap((entry) => (entry ?? "").split(",")).map((entry) => entry.trim()).filter((entry) => entry !== "");
	return [...new Set(merged)].join(",");
}
/** Read the first proxy name the environment supplies with a non-empty value. */
function explicitProxyEnvName(env) {
	for (const name of EXPLICIT_PROXY_ENV_NAMES) if ((env.get(name)?.value ?? "").trim() !== "") return name;
}
/**
* Decide the proxy environment this process runs with.
*
* An explicitly exported proxy wins over the system configuration, matching what `curl` and every
* browser do: a user who exported `HTTPS_PROXY` chose a route for this program specifically, and
* silently overriding it with the machine-wide setting would be the surprising outcome. That case
* synthesizes nothing and hands the environment through untouched, so the upstream resolver applies
* its own precedence — including the `ALL_PROXY` fallback — exactly as it does for the CLI.
*
* @param input - the launch environment, the probe result, and this machine's LAN literals.
* @returns the overlay to apply, which layer won, and the lines to log.
*/
function buildDesktopProxyOverlay(input) {
	const { env, probe, lanAddresses = [] } = input;
	const diagnostics = [...probe.notes ?? []];
	const explicit = explicitProxyEnvName(env);
	if (explicit !== void 0) {
		const summary = `outbound proxy = ${env.get(explicit)?.value ?? ""} (source: environment ${explicit}; system proxy ignored)`;
		return {
			overlay: Object.freeze({}),
			source: "environment",
			diagnostics: Object.freeze(diagnostics),
			summary
		};
	}
	if (probe.http === void 0 && probe.https === void 0) {
		const reason = diagnostics.length === 0 ? "the system proxy resolver returned DIRECT for every probe" : "no usable system proxy was found";
		return {
			overlay: Object.freeze({}),
			source: "none",
			diagnostics: Object.freeze(diagnostics),
			summary: `outbound proxy = none (source: none; ${reason})`
		};
	}
	const noProxy = mergeNoProxy([
		env.get("no_proxy")?.value ?? env.get("NO_PROXY")?.value,
		...lanAddresses,
		".local"
	]);
	const overlay = { no_proxy: noProxy };
	if (probe.http !== void 0) overlay.http_proxy = probe.http;
	if (probe.https !== void 0) overlay.https_proxy = probe.https;
	if (probe.disagreed === true) diagnostics.push("system proxy answers differ between probe URLs, which means per-URL PAC rules are in force; applying the first proxy found, so some hosts may be routed differently than in your browser");
	const applied = probe.https ?? probe.http ?? "";
	return {
		overlay: Object.freeze(overlay),
		source: "system",
		diagnostics: Object.freeze(diagnostics),
		summary: `outbound proxy = ${applied} (source: system, no_proxy: ${noProxy})`
	};
}
/**
* Layer a synthesized overlay over the launch environment.
*
* The overlay wins, because {@link buildDesktopProxyOverlay} already applied the precedence: it is
* empty whenever the user exported a proxy themselves, and its bypass list already carries whatever
* they wrote. Both processes resolve their policy through this one function, so the Host can never
* route differently from the supervisor that told it what to route.
*
* @param snapshot - the launch environment snapshot.
* @param overlay - names synthesized from the system proxy, keyed lowercase.
* @returns a lookup the upstream resolver accepts unchanged.
*/
function desktopProxyEnvLookup(snapshot, overlay) {
	return { get(name) {
		const synthesized = overlay[name.toLowerCase()];
		if (synthesized !== void 0) return { value: synthesized };
		return snapshot.get(name);
	} };
}
/**
* Explain a SOCKS-only system proxy in terms of the switch the user can actually reach.
*
* Letting the upstream resolver report this instead would name `HTTPS_PROXY` — a variable the user
* never set — and send them looking for a misconfiguration that is not there.
*
* @param url - the probe URL whose answer was SOCKS.
* @param detail - the rejected PAC entries.
* @returns one operator-facing sentence.
*/
function socksProxyDiagnostic(url, detail) {
	return `the system proxy for ${url} is ${detail}, which Node-side HTTP cannot use; those requests will connect directly. Enable your proxy client's HTTP or mixed port and turn on the system HTTP proxy, or set HTTPS_PROXY to an http:// URL. Application windows and the update check are unaffected.`;
}
//#endregion
//#region src/startup-audit.ts
/**
* Record every startup entry that did not activate.
*
* `boot()` already audits the settled tree, but its default sink is
* `process.stderr`, which a packaged Electron Host discards. An optional entry
* that never activated -- a failed import, or one still waiting on a service
* nothing provides -- therefore leaves no trace in the Host log, the exported
* diagnostics, or anything a bug report can carry. Re-running the audit costs
* one synchronous pass over the Loader's entries and routes the identical
* diagnostic through the logger the file exporter persists.
*
* Required-entry failures cannot reach here: `boot()` rejects on them before it
* returns. The catch covers the case where that ever stops being true, because
* a diagnostic must never be the thing that stops the app from starting.
*
* @param ctx - the settled boot context.
* @param binName - the diagnostic prefix, matching the one `boot()` was given.
*/
async function logInactiveStartupEntries(ctx, binName) {
	try {
		await auditStartupEntries(ctx, binName, (line) => {
			ctx.logger.warn("%s", line.trimEnd());
		});
	} catch (cause) {
		ctx.logger.warn("%s", `${binName}: startup activation report failed: ${cause instanceof Error ? cause.message : String(cause)}`);
	}
}
//#endregion
//#region src/desktop-actions.ts
/** Narrow, generation-scoped native actions available to trusted Host plugins. */
/** Publish only terminal-open and restart operations for one Cordis generation. */
var DesktopActionsService = class extends Service {
	bootstrap;
	disposed = false;
	restartCompleted = false;
	restartOperation;
	constructor(ctx, bootstrap) {
		super(ctx, "desktopActions");
		this.bootstrap = bootstrap;
		ctx.effect(() => () => {
			this.disposed = true;
		}, "dsh-plugin-desktop: desktop actions lifetime");
	}
	openTerminal() {
		this.assertActive();
		this.bootstrap.openTerminal();
	}
	requestRestart() {
		try {
			this.assertActive();
			if (this.restartCompleted) return Promise.resolve();
			if (this.restartOperation !== void 0) return this.restartOperation;
			const operation = (async () => {
				this.assertActive();
				await this.bootstrap.requestRestart();
				this.restartCompleted = true;
			})();
			this.restartOperation = operation;
			operation.catch(() => {
				if (this.restartOperation === operation) this.restartOperation = void 0;
			});
			return operation;
		} catch (cause) {
			return Promise.reject(cause);
		}
	}
	assertActive() {
		if (this.disposed) throw new Error("dsh-plugin-desktop: desktopActions service disposed");
	}
};
//#endregion
//#region src/desktop-settings-controller.ts
/** Remove paths, bundle identities, and parser diagnostics from a profile. */
function projectDesktopSettingsProfile(profile, deletable = false) {
	return Object.freeze({
		name: profile.name,
		exists: profile.exists,
		webCapable: profile.webCapable,
		selectable: profile.exists && profile.webCapable && profile.problem === void 0,
		deletable
	});
}
function projectMarket(value, effective) {
	return Object.freeze({
		requested: value.requested,
		effective,
		legacyDefaulted: value.legacyDefaulted
	});
}
/**
* Generation-scoped controller for Profile and Market preferences.
*
* The provider composed at startup remains `effective` for this controller's
* lifetime. Persisting another provider changes only `requested` until the
* queued restart creates a new Host generation.
*/
var DesktopSettingsController = class {
	bootstrap;
	effectiveMarket;
	constructor(bootstrap) {
		this.bootstrap = bootstrap;
		this.effectiveMarket = bootstrap.readMarket().effective;
	}
	/** Read a fresh, renderer-safe settings projection. */
	read() {
		const web = this.bootstrap.readWeb();
		return Object.freeze({
			current: this.bootstrap.profiles.current.name,
			profiles: Object.freeze(this.bootstrap.profiles.list().map((profile) => projectDesktopSettingsProfile(profile, this.bootstrap.profiles.canDelete?.(profile.name) ?? false))),
			aa: Object.freeze(this.bootstrap.readAa?.() ?? {
				requested: false,
				effective: false
			}),
			market: projectMarket(this.bootstrap.readMarket(), this.effectiveMarket),
			web: Object.freeze({
				localUrl: web.localUrl,
				lanUrls: Object.freeze([...web.lanUrls]),
				lanState: web.lanState,
				lanError: web.lanError,
				lanCaFingerprint: web.lanCaFingerprint,
				lanCaUrls: Object.freeze([...web.lanCaUrls])
			})
		});
	}
	/** Create one safe profile without selecting it or requesting restart. */
	createProfile(name) {
		this.bootstrap.profiles.create(name);
		return this.read();
	}
	/** Delete one inactive user profile and return the fresh settings state. */
	async deleteProfile(name) {
		if (this.bootstrap.profiles.delete === void 0) throw new Error("dsh-plugin-desktop: profile deletion is unavailable");
		await this.bootstrap.profiles.delete(name);
		return this.read();
	}
	/** Persist a fresh compatible profile, deferring restart until after response. */
	async selectProfile(name) {
		const selection = await this.bootstrap.profiles.prepareSelection(name);
		return Object.freeze({
			response: Object.freeze({
				accepted: true,
				restartRequired: selection.restartRequired
			}),
			...selection.restartRequired ? { afterResponse: () => selection.restart() } : {}
		});
	}
	/** Persist a provider and defer restart until after the response is ended. */
	async selectMarket(provider) {
		await this.bootstrap.selectMarket(provider);
		const restartRequired = provider !== this.effectiveMarket;
		return Object.freeze({
			response: Object.freeze({
				accepted: true,
				restartRequired
			}),
			...restartRequired ? { afterResponse: () => {
				this.bootstrap.scheduleRestart();
			} } : {}
		});
	}
	async selectAa(enabled) {
		if (!this.bootstrap.selectAa || !this.bootstrap.readAa) throw new Error("AA selection is unavailable");
		await this.bootstrap.selectAa(enabled);
		const restartRequired = enabled !== this.bootstrap.readAa().effective;
		return Object.freeze({
			response: Object.freeze({
				accepted: true,
				restartRequired
			}),
			...restartRequired ? { afterResponse: () => {
				this.bootstrap.scheduleRestart();
			} } : {}
		});
	}
	/** Open the native terminal through the launcher-owned action. */
	openTerminal() {
		this.bootstrap.openTerminal();
		return Object.freeze({ accepted: true });
	}
	/** Acknowledge the renderer before queueing an orderly Desktop relaunch. */
	restart() {
		return Object.freeze({
			response: Object.freeze({ accepted: true }),
			afterResponse: () => {
				this.bootstrap.scheduleRestart();
			}
		});
	}
	/** Acknowledge the renderer before queueing a recovery-mode relaunch. */
	restartToRecovery() {
		return Object.freeze({
			response: Object.freeze({ accepted: true }),
			afterResponse: () => {
				this.bootstrap.scheduleRecoveryRestart();
			}
		});
	}
	/** Acknowledge the renderer before replacing its current document. */
	reloadRenderer() {
		return Object.freeze({
			response: Object.freeze({ accepted: true }),
			afterResponse: () => {
				this.bootstrap.reloadRenderer();
			}
		});
	}
	/** Toggle Developer Tools without exposing an Electron bridge to the page. */
	toggleDeveloperTools() {
		this.bootstrap.toggleDeveloperTools();
		return Object.freeze({ accepted: true });
	}
	/** Export diagnostics through the native confirmation and reveal flow. */
	async exportDiagnostics() {
		await this.bootstrap.exportDiagnostics();
		return Object.freeze({ accepted: true });
	}
};
//#endregion
//#region src/profile-checkpoint.ts
/**
* Healthy-start configuration checkpoints for Desktop recovery.
*
* Exactly three rotating slots are retained. Restoring a slot never launches
* pnpm and never copies node_modules; it only restores the fixed declarative
* Profile and Harness-home files listed below. The first healthy startup after
* a restore intentionally consumes a skip marker instead of replacing a
* checkpoint.
*/
const BIN_NAME$1 = "dsh-plugin-desktop";
const MANIFEST_VERSION = 4;
const PREVIOUS_MANIFEST_VERSION = 3;
const LEGACY_MANIFEST_VERSION = 2;
const SKIP_MARKER_VERSION = 1;
const SNAPSHOT_ROOT = "health-snapshots";
const MANIFEST_FILENAME = "manifest.json";
const SKIP_MARKER_FILENAME = "skip-next-healthy.json";
const FILE_MODE = 384;
const DIRECTORY_MODE = 448;
const MANIFEST_MAX_BYTES = 1 * 1024 * 1024;
const CHECK_POSIX_MODE$1 = process.platform !== "win32";
const HASH_PATTERN$1 = /^[0-9a-f]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,256}$/u;
const DESKTOP_PROFILE_CHECKPOINT_SLOT_IDS = [
	"slot-1",
	"slot-2",
	"slot-3"
];
const LEGACY_PROFILE_CHECKPOINT_FILES = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"cordis.patch.yml",
	".dsh-market/state.json"
];
/** Files covered by unified startup recovery. Optional files retain absence. */
const DESKTOP_PROFILE_CHECKPOINT_FILES = [
	...LEGACY_PROFILE_CHECKPOINT_FILES,
	"home/settings.yaml",
	"home/cordis.patch.yml"
];
const FILE_LIMITS = {
	"package.json": 1 * 1024 * 1024,
	"pnpm-lock.yaml": 32 * 1024 * 1024,
	"pnpm-workspace.yaml": 1 * 1024 * 1024,
	"cordis.patch.yml": 1 * 1024 * 1024,
	".dsh-market/state.json": 1 * 1024 * 1024,
	"home/settings.yaml": 4 * 1024 * 1024,
	"home/cordis.patch.yml": 1 * 1024 * 1024
};
function fail(message) {
	throw new Error(`${BIN_NAME$1}: ${message}`);
}
function assertAbsolute(label, value) {
	if (typeof value !== "string" || value.length === 0 || !isAbsolute(value) || value.includes("\0")) fail(`${label} must be an absolute path without NUL`);
	return resolve(value);
}
function assertIdentifier(label, value) {
	if (typeof value !== "string" || !ID_PATTERN.test(value) || value.includes("\\")) fail(`invalid ${label}`);
	return value;
}
function assertProfileName(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 255 || value.includes("/") || value.includes("\\") || /[\0\r\n]/u.test(value)) fail("invalid profile name");
	return value;
}
function assertAppVersion(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128 || /[\0\r\n]/u.test(value)) fail("invalid Desktop version");
	return value;
}
function assertReleaseChannel(value) {
	if (value !== "stable" && value !== "beta") fail("invalid Desktop release channel");
	return value;
}
function assertSlotId(value) {
	if (!DESKTOP_PROFILE_CHECKPOINT_SLOT_IDS.includes(value)) fail("invalid checkpoint slot");
	return value;
}
function hash(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}
function isENOENT(cause) {
	return cause?.code === "ENOENT";
}
function realDirectory(label, path) {
	const absolute = assertAbsolute(label, path);
	let item;
	try {
		item = lstatSync(absolute);
	} catch (cause) {
		fail(`${label} is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
	}
	if (!item.isDirectory() || item.isSymbolicLink()) fail(`${label} must be a real directory`);
	realpathSync(absolute);
	return absolute;
}
function ensureDirectory(path) {
	mkdirSync(path, {
		recursive: true,
		mode: DIRECTORY_MODE
	});
	const item = lstatSync(path);
	if (!item.isDirectory() || item.isSymbolicLink()) fail(`checkpoint directory is not a real directory: ${path}`);
	if (CHECK_POSIX_MODE$1 && (item.mode & 511) !== DIRECTORY_MODE) chmodSync(path, DIRECTORY_MODE);
}
function writeDurable(path, bytes, mode = FILE_MODE) {
	ensureDirectory(dirname(path));
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	let fd;
	try {
		fd = openSync(temporary, "wx", mode);
		writeSync(fd, bytes);
		fsyncSync(fd);
		closeSync(fd);
		fd = void 0;
		renameSync(temporary, path);
		try {
			const directoryFd = openSync(dirname(path), "r");
			try {
				fsyncSync(directoryFd);
			} finally {
				closeSync(directoryFd);
			}
		} catch {}
	} finally {
		if (fd !== void 0) closeSync(fd);
		try {
			unlinkSync(temporary);
		} catch {}
	}
}
function readJson(path) {
	const item = lstatSync(path);
	if (!item.isFile() || item.isSymbolicLink() || CHECK_POSIX_MODE$1 && (item.mode & 511) !== FILE_MODE) fail(`checkpoint file has unsafe type or mode: ${path}`);
	if (item.size > MANIFEST_MAX_BYTES) fail(`checkpoint file is too large: ${path}`);
	return JSON.parse(readFileSync(path, "utf8"));
}
function checkpointPluginCount(directory) {
	try {
		const value = readJson(filePath(directory, "package.json"));
		if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
		const dsh = value.dsh;
		if (dsh === null || typeof dsh !== "object" || Array.isArray(dsh)) return void 0;
		const profile = dsh.profile;
		if (profile === null || typeof profile !== "object" || Array.isArray(profile)) return void 0;
		const bundles = profile.bundles;
		if (!Array.isArray(bundles) || bundles.some((bundle) => typeof bundle !== "string")) return void 0;
		return bundles.length;
	} catch {
		return;
	}
}
function fileEqual(left, right) {
	return left.present === right.present && (!left.present || left.sha256 === right.sha256 && left.size === right.size && left.mode === right.mode);
}
function filePath(root, name) {
	const path = join(root, ...name.split("/"));
	if (path !== resolve(root, ...name.split("/")) || relative(root, path).startsWith("..")) fail("checkpoint filename escaped its root");
	return path;
}
function checkpointFiles(version) {
	if (version === LEGACY_MANIFEST_VERSION) return LEGACY_PROFILE_CHECKPOINT_FILES;
	if (version === PREVIOUS_MANIFEST_VERSION || version === MANIFEST_VERSION) return DESKTOP_PROFILE_CHECKPOINT_FILES;
	fail("checkpoint manifest is invalid");
}
/**
* Read the newest healthy-start identity without creating directories, rotating
* slots, recovering interrupted writes, or reading snapshotted Profile files.
*/
function inspectLatestDesktopProfileCheckpointUsage(options) {
	let userDataDir;
	let profileDir;
	let profileName;
	let legacyPackageName;
	let legacyChannel;
	try {
		userDataDir = assertAbsolute("userDataDir", options.userDataDir);
		profileDir = assertAbsolute("profileDir", options.profileDir);
		profileName = assertProfileName(options.profileName);
		legacyPackageName = assertIdentifier("Desktop package name", options.legacyDesktopPackageName);
		legacyChannel = assertReleaseChannel(options.legacyReleaseChannel);
	} catch (cause) {
		return {
			status: "invalid",
			problem: cause instanceof Error ? cause.message : String(cause)
		};
	}
	const profileIdentity = hash(profileDir);
	const snapshotRoot = join(userDataDir, SNAPSHOT_ROOT);
	const profileRoot = join(snapshotRoot, hash(profileIdentity));
	try {
		const userData = lstatSync(userDataDir);
		if (!userData.isDirectory() || userData.isSymbolicLink()) fail("userDataDir must be a real directory");
		const snapshots = lstatSync(snapshotRoot);
		if (!snapshots.isDirectory() || snapshots.isSymbolicLink() || CHECK_POSIX_MODE$1 && (snapshots.mode & 511) !== DIRECTORY_MODE) fail("checkpoint root has unsafe type or mode");
		const root = lstatSync(profileRoot);
		if (!root.isDirectory() || root.isSymbolicLink() || CHECK_POSIX_MODE$1 && (root.mode & 511) !== DIRECTORY_MODE) fail("checkpoint directory has unsafe type or mode");
	} catch (cause) {
		if (isENOENT(cause)) return { status: "none" };
		return {
			status: "invalid",
			problem: cause instanceof Error ? cause.message : String(cause)
		};
	}
	let latest;
	try {
		for (const slotId of DESKTOP_PROFILE_CHECKPOINT_SLOT_IDS) {
			const directory = join(profileRoot, slotId);
			let directoryItem;
			try {
				directoryItem = lstatSync(directory);
			} catch (cause) {
				if (isENOENT(cause)) continue;
				throw cause;
			}
			if (!directoryItem.isDirectory() || directoryItem.isSymbolicLink() || CHECK_POSIX_MODE$1 && (directoryItem.mode & 511) !== DIRECTORY_MODE) fail("checkpoint directory has unsafe type or mode");
			const value = readJson(join(directory, MANIFEST_FILENAME));
			if (value === null || typeof value !== "object" || Array.isArray(value)) fail("checkpoint manifest is invalid");
			const object = value;
			const expectedFiles = checkpointFiles(object.version);
			if (typeof object.snapshotId !== "string" || !ID_PATTERN.test(object.snapshotId) || typeof object.capturedAt !== "string" || !Number.isFinite(Date.parse(object.capturedAt)) || new Date(Date.parse(object.capturedAt)).toISOString() !== object.capturedAt || object.profileIdentity !== profileIdentity || object.profileName !== profileName || object.slotId !== slotId || object.reason !== "healthy-startup" || typeof object.provider !== "string" || assertIdentifier("checkpoint provider", object.provider) !== object.provider || typeof object.appVersion !== "string" || assertAppVersion(object.appVersion) !== object.appVersion || !Array.isArray(object.files) || object.files.length !== expectedFiles.length) fail("checkpoint metadata is invalid");
			for (let index = 0; index < expectedFiles.length; index += 1) {
				const record = object.files[index];
				const expected = expectedFiles[index];
				if (record === null || typeof record !== "object" || Array.isArray(record)) fail("checkpoint manifest is invalid");
				const item = record;
				if (item.name !== expected || typeof item.present !== "boolean") fail("checkpoint manifest is invalid");
				if (item.present && (typeof item.sha256 !== "string" || !HASH_PATTERN$1.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > FILE_LIMITS[expected] || !Number.isSafeInteger(item.mode) || item.mode < 0 || item.mode > 511)) fail("checkpoint manifest is invalid");
			}
			let desktopPackageName = legacyPackageName;
			let releaseChannel = legacyChannel;
			let dshVersion;
			if (object.version === MANIFEST_VERSION) {
				if (typeof object.desktopPackageName !== "string" || assertIdentifier("Desktop package name", object.desktopPackageName) !== legacyPackageName || typeof object.releaseChannel !== "string" || typeof object.dshVersion !== "string") fail("checkpoint Desktop identity is invalid");
				const manifestChannel = assertReleaseChannel(object.releaseChannel);
				if (manifestChannel !== legacyChannel) fail("checkpoint Desktop identity is invalid");
				desktopPackageName = object.desktopPackageName;
				releaseChannel = manifestChannel;
				dshVersion = assertAppVersion(object.dshVersion);
			}
			const evidence = Object.freeze({
				source: "checkpoint",
				recordedAt: object.capturedAt,
				desktopPackageName,
				releaseChannel,
				desktopVersion: object.appVersion,
				...dshVersion === void 0 ? {} : { dshVersion }
			});
			if (latest === void 0 || Date.parse(evidence.recordedAt) > Date.parse(latest.recordedAt)) latest = evidence;
		}
		return latest === void 0 ? { status: "none" } : {
			status: "valid",
			evidence: latest
		};
	} catch (cause) {
		return {
			status: "invalid",
			problem: cause instanceof Error ? cause.message : String(cause)
		};
	}
}
function targetPath(profileDir, homeDir, name) {
	if (name === "home/settings.yaml") return join(homeDir, "settings.yaml");
	if (name === "home/cordis.patch.yml") return join(homeDir, "cordis.patch.yml");
	return filePath(profileDir, name);
}
function assertTargetParent(profileDir, homeDir, name) {
	const parent = dirname(targetPath(profileDir, homeDir, name));
	try {
		const item = lstatSync(parent);
		if (item.isSymbolicLink() || !item.isDirectory()) fail(`checkpoint target parent must be a real directory: ${name}`);
		realpathSync(parent);
	} catch (cause) {
		if (!isENOENT(cause)) throw cause;
	}
}
/** Three-slot Profile checkpoint manager. */
var DesktopProfileCheckpoint = class {
	userDataDir;
	profileDir;
	homeDir;
	profileIdentity;
	profileName;
	provider;
	appVersion;
	desktopPackageName;
	releaseChannel;
	dshVersion;
	profileRoot;
	limits;
	now;
	constructor(options) {
		const userData = options.userDataDir ?? options.userData;
		const profile = options.profileDir ?? options.profilePath;
		if (userData === void 0 || profile === void 0) fail("userDataDir and profileDir are required");
		this.userDataDir = realDirectory("userDataDir", userData);
		this.profileDir = realDirectory("profileDir", profile);
		this.homeDir = realDirectory("homeDir", options.homeDir ?? resolve(this.profileDir, "..", ".."));
		this.profileIdentity = assertIdentifier("profile identity", options.profileIdentity ?? hash(this.profileDir));
		this.profileName = assertProfileName(options.profileName ?? "desktop");
		this.provider = assertIdentifier("provider", options.provider ?? "unknown");
		this.appVersion = assertAppVersion(options.appVersion ?? "unknown");
		this.desktopPackageName = assertIdentifier("Desktop package name", options.desktopPackageName ?? "dsh-plugin-desktop");
		this.releaseChannel = assertReleaseChannel(options.releaseChannel ?? "stable");
		this.dshVersion = assertAppVersion(options.dshVersion ?? "unknown");
		this.now = options.now ?? Date.now;
		this.limits = {
			...FILE_LIMITS,
			...options.maxFileBytes ?? {}
		};
		for (const name of DESKTOP_PROFILE_CHECKPOINT_FILES) if (!Number.isSafeInteger(this.limits[name]) || this.limits[name] < 0) fail(`invalid size limit for ${name}`);
		const root = join(this.userDataDir, SNAPSHOT_ROOT);
		ensureDirectory(root);
		this.profileRoot = join(root, hash(this.profileIdentity));
		ensureDirectory(this.profileRoot);
	}
	/** Return all three stable slots, including empty slots. */
	listSlots() {
		this.recoverOrphanedSlots();
		return DESKTOP_PROFILE_CHECKPOINT_SLOT_IDS.map((slotId) => {
			const directory = this.slotDirectory(slotId);
			const snapshot = this.readSnapshot(directory, false);
			return snapshot === void 0 ? {
				slotId,
				snapshotExists: false,
				snapshotDirectory: directory
			} : (() => {
				const pluginCount = checkpointPluginCount(snapshot.directory);
				return {
					slotId,
					snapshotExists: true,
					snapshotDirectory: directory,
					manifest: snapshot.manifest,
					...pluginCount === void 0 ? {} : { pluginCount },
					totalBytes: snapshot.manifest.files.reduce((total, file) => total + (file.present ? file.size ?? 0 : 0), 0)
				};
			})();
		});
	}
	/** Capture every healthy startup, rotating the oldest of the three slots. */
	captureHealthy() {
		this.recoverOrphanedSlots();
		const current = this.readCurrentImages(DESKTOP_PROFILE_CHECKPOINT_FILES, true);
		const skip = this.readSkipMarker();
		if (skip !== void 0) {
			unlinkSync(join(this.profileRoot, SKIP_MARKER_FILENAME));
			return {
				status: "skipped-after-restore",
				restoredSlotId: skip.restoredSlotId
			};
		}
		const slots = this.listSlots();
		const target = slots.find((slot) => !slot.snapshotExists) ?? [...slots].sort((left, right) => {
			return Date.parse(left.manifest.capturedAt) - Date.parse(right.manifest.capturedAt) || left.slotId.localeCompare(right.slotId);
		})[0];
		const snapshotId = randomUUID();
		const targetDirectory = target.snapshotDirectory;
		const staging = join(this.profileRoot, `.staging-${target.slotId}-${process.pid}-${snapshotId}`);
		ensureDirectory(staging);
		try {
			const records = [];
			for (let index = 0; index < DESKTOP_PROFILE_CHECKPOINT_FILES.length; index += 1) {
				const name = DESKTOP_PROFILE_CHECKPOINT_FILES[index];
				const image = current[index];
				records.push({
					name,
					...image
				});
				if (image.present) {
					const destination = filePath(staging, name);
					ensureDirectory(dirname(destination));
					writeDurable(destination, readFileSync(targetPath(this.profileDir, this.homeDir, name)));
				}
			}
			const manifest = {
				version: MANIFEST_VERSION,
				snapshotId,
				capturedAt: new Date(this.now()).toISOString(),
				profileIdentity: this.profileIdentity,
				profileName: this.profileName,
				provider: this.provider,
				slotId: target.slotId,
				reason: "healthy-startup",
				appVersion: this.appVersion,
				desktopPackageName: this.desktopPackageName,
				releaseChannel: this.releaseChannel,
				dshVersion: this.dshVersion,
				files: records
			};
			writeDurable(join(staging, MANIFEST_FILENAME), Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8"));
			this.replaceSlot(targetDirectory, staging);
			return {
				status: "captured",
				slotId: target.slotId,
				snapshotDirectory: targetDirectory,
				manifest
			};
		} catch (cause) {
			rmSync(staging, {
				recursive: true,
				force: true
			});
			throw cause;
		}
	}
	inspectSlot(slotId) {
		const resolvedSlot = assertSlotId(slotId);
		this.recoverOrphanedSlot(resolvedSlot);
		const snapshot = this.readSnapshot(this.slotDirectory(resolvedSlot), false);
		if (snapshot === void 0) return {
			slotId: resolvedSlot,
			snapshotExists: false,
			currentDiffers: false,
			changedFiles: []
		};
		const names = checkpointFiles(snapshot.manifest.version);
		const current = this.readCurrentImages(names, false);
		const changedFiles = names.filter((_, index) => !fileEqual(snapshot.manifest.files[index], current[index]));
		return {
			slotId: resolvedSlot,
			snapshotExists: true,
			currentDiffers: changedFiles.length > 0,
			changedFiles,
			manifest: snapshot.manifest
		};
	}
	/** Restore one user-selected slot and preserve it across the next healthy boot. */
	restoreSlot(slotId) {
		const resolvedSlot = assertSlotId(slotId);
		this.recoverOrphanedSlot(resolvedSlot);
		const snapshot = this.readSnapshot(this.slotDirectory(resolvedSlot), true);
		if (snapshot === void 0) fail(`checkpoint ${resolvedSlot} is empty`);
		const names = checkpointFiles(snapshot.manifest.version);
		const current = this.readCurrentImages(names, false);
		const changedFiles = names.filter((_, index) => !fileEqual(snapshot.manifest.files[index], current[index]));
		const dependencyMaterializationRequired = this.readSkipMarker()?.dependencyMaterializationPending === true || changedFiles.some((name) => name === "package.json" || name === "pnpm-lock.yaml" || name === "pnpm-workspace.yaml");
		writeDurable(join(this.profileRoot, SKIP_MARKER_FILENAME), Buffer.from(`${JSON.stringify({
			version: SKIP_MARKER_VERSION,
			restoredSlotId: resolvedSlot,
			restoredAt: new Date(this.now()).toISOString(),
			dependencyMaterializationPending: dependencyMaterializationRequired
		})}\n`, "utf8"));
		for (const name of names) assertTargetParent(this.profileDir, this.homeDir, name);
		for (let index = 0; index < names.length; index += 1) {
			const name = names[index];
			const record = snapshot.manifest.files[index];
			const target = targetPath(this.profileDir, this.homeDir, name);
			if (record.present) {
				const bytes = readFileSync(filePath(snapshot.directory, name));
				if (hash(bytes) !== record.sha256 || bytes.byteLength !== record.size) fail(`checkpoint changed during restore: ${name}`);
				writeDurable(target, bytes, record.mode);
			} else try {
				const item = lstatSync(target);
				if (item.isSymbolicLink() || !item.isFile()) fail(`cannot remove unsafe profile entry: ${name}`);
				unlinkSync(target);
			} catch (cause) {
				if (!isENOENT(cause)) throw cause;
			}
		}
		return {
			status: "restored",
			slotId: resolvedSlot,
			changedFiles,
			dependencyMaterializationRequired,
			snapshotDirectory: snapshot.directory
		};
	}
	/** Keep the checkpoint-preservation marker but clear its derived dependency work. */
	completeDependencyMaterialization(slotId) {
		const resolvedSlot = assertSlotId(slotId);
		const marker = this.readSkipMarker();
		if (marker === void 0 || marker.restoredSlotId !== resolvedSlot) fail("checkpoint materialization completion does not match the active restore");
		if (!marker.dependencyMaterializationPending) return;
		writeDurable(join(this.profileRoot, SKIP_MARKER_FILENAME), Buffer.from(`${JSON.stringify({
			...marker,
			dependencyMaterializationPending: false
		})}\n`, "utf8"));
	}
	slotDirectory(slotId) {
		return join(this.profileRoot, slotId);
	}
	readCurrentImages(names, requirePackage) {
		return names.map((name) => {
			assertTargetParent(this.profileDir, this.homeDir, name);
			const path = targetPath(this.profileDir, this.homeDir, name);
			let item;
			try {
				item = lstatSync(path);
			} catch (cause) {
				if (isENOENT(cause)) {
					if (requirePackage && name === "package.json") fail("healthy profile package.json is unavailable");
					return { present: false };
				}
				throw cause;
			}
			if (item.isSymbolicLink() || !item.isFile()) fail(`checkpoint entry must be a regular file: ${name}`);
			if (item.size > this.limits[name]) fail(`profile checkpoint file is too large: ${name}`);
			const bytes = readFileSync(path);
			return {
				present: true,
				sha256: hash(bytes),
				size: bytes.byteLength,
				mode: item.mode & 511
			};
		});
	}
	replaceSlot(target, staging) {
		if (!existsSync(target)) {
			renameSync(staging, target);
			return;
		}
		const old = `${target}.old-${randomUUID()}`;
		renameSync(target, old);
		try {
			renameSync(staging, target);
		} catch (cause) {
			renameSync(old, target);
			throw cause;
		}
		rmSync(old, {
			recursive: true,
			force: true
		});
	}
	recoverOrphanedSlots() {
		for (const slotId of DESKTOP_PROFILE_CHECKPOINT_SLOT_IDS) this.recoverOrphanedSlot(slotId);
	}
	recoverOrphanedSlot(slotId) {
		const target = this.slotDirectory(slotId);
		if (existsSync(target)) return;
		let candidates;
		try {
			candidates = readdirSync(this.profileRoot).filter((name) => name.startsWith(`${slotId}.old-`)).sort().reverse();
		} catch (cause) {
			if (isENOENT(cause)) return;
			throw cause;
		}
		for (const name of candidates) {
			const candidate = join(this.profileRoot, name);
			try {
				const item = lstatSync(candidate);
				if (!item.isDirectory() || item.isSymbolicLink() || CHECK_POSIX_MODE$1 && (item.mode & 511) !== DIRECTORY_MODE) continue;
				renameSync(candidate, target);
				return;
			} catch (cause) {
				if (!isENOENT(cause)) throw cause;
			}
		}
	}
	readSkipMarker() {
		const path = join(this.profileRoot, SKIP_MARKER_FILENAME);
		try {
			const value = readJson(path);
			if (value === null || typeof value !== "object" || Array.isArray(value)) fail("skip healthy marker is invalid");
			const marker = value;
			if (marker.version !== SKIP_MARKER_VERSION || typeof marker.restoredSlotId !== "string" || typeof marker.restoredAt !== "string" || !Number.isFinite(Date.parse(marker.restoredAt)) || marker.dependencyMaterializationPending !== void 0 && typeof marker.dependencyMaterializationPending !== "boolean") fail("skip healthy marker is invalid");
			return {
				version: SKIP_MARKER_VERSION,
				restoredSlotId: assertSlotId(marker.restoredSlotId),
				restoredAt: marker.restoredAt,
				dependencyMaterializationPending: marker.dependencyMaterializationPending === true
			};
		} catch (cause) {
			if (isENOENT(cause)) return void 0;
			throw cause;
		}
	}
	readSnapshot(directory, requireComplete) {
		try {
			const expectedSlotId = assertSlotId(basename(directory));
			const directoryItem = lstatSync(directory);
			if (!directoryItem.isDirectory() || directoryItem.isSymbolicLink() || CHECK_POSIX_MODE$1 && (directoryItem.mode & 511) !== DIRECTORY_MODE) fail("checkpoint directory has unsafe type or mode");
			const value = readJson(join(directory, MANIFEST_FILENAME));
			if (value === null || typeof value !== "object" || Array.isArray(value)) fail("checkpoint manifest is invalid");
			const object = value;
			const files = object.files;
			const expectedFiles = checkpointFiles(object.version);
			if (typeof object.snapshotId !== "string" || !ID_PATTERN.test(object.snapshotId) || typeof object.capturedAt !== "string" || !Number.isFinite(Date.parse(object.capturedAt)) || object.profileIdentity !== this.profileIdentity || object.profileName !== this.profileName || typeof object.provider !== "string" || assertIdentifier("checkpoint provider", object.provider) !== object.provider || !Array.isArray(files) || files.length !== expectedFiles.length) fail("checkpoint manifest is invalid");
			if (object.slotId !== expectedSlotId || object.reason !== "healthy-startup" || typeof object.appVersion !== "string" || assertAppVersion(object.appVersion) !== object.appVersion) fail("checkpoint metadata is invalid");
			if (object.version === MANIFEST_VERSION && (typeof object.desktopPackageName !== "string" || assertIdentifier("Desktop package name", object.desktopPackageName) !== object.desktopPackageName || typeof object.releaseChannel !== "string" || assertReleaseChannel(object.releaseChannel) !== object.releaseChannel || typeof object.dshVersion !== "string" || assertAppVersion(object.dshVersion) !== object.dshVersion)) fail("checkpoint Desktop identity is invalid");
			for (let index = 0; index < expectedFiles.length; index += 1) {
				const record = files[index];
				const expected = expectedFiles[index];
				if (record === null || typeof record !== "object" || Array.isArray(record)) fail("checkpoint manifest is invalid");
				const item = record;
				if (item.name !== expected || typeof item.present !== "boolean") fail("checkpoint manifest is invalid");
				if (item.present && (typeof item.sha256 !== "string" || !HASH_PATTERN$1.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > this.limits[expected] || !Number.isSafeInteger(item.mode) || item.mode < 0 || item.mode > 511)) fail("checkpoint manifest is invalid");
				const backup = filePath(directory, expected);
				if (item.present) {
					const backupItem = lstatSync(backup);
					if (!backupItem.isFile() || backupItem.isSymbolicLink() || CHECK_POSIX_MODE$1 && (backupItem.mode & 511) !== FILE_MODE) fail(`checkpoint backup is unsafe: ${expected}`);
					const bytes = readFileSync(backup);
					if (bytes.byteLength !== item.size || hash(bytes) !== item.sha256) fail(`checkpoint backup is incomplete: ${expected}`);
				} else if (existsSync(backup)) fail(`checkpoint contains an unexpected backup: ${expected}`);
			}
			if (requireComplete && !files.some((record) => record.present === true)) fail("checkpoint contains no restorable files");
			return {
				directory,
				manifest: value
			};
		} catch (cause) {
			if (isENOENT(cause)) try {
				lstatSync(directory);
			} catch (directoryCause) {
				if (isENOENT(directoryCause)) return void 0;
			}
			throw cause;
		}
	}
};
/** Remove all three slots and the skip marker for one deleted Profile. */
function clearDesktopProfileCheckpoint(userDataDir, profileDir) {
	const absoluteUserData = assertAbsolute("userDataDir", userDataDir);
	try {
		lstatSync(absoluteUserData);
	} catch (cause) {
		if (isENOENT(cause)) return;
		throw cause;
	}
	const userData = realDirectory("userDataDir", absoluteUserData);
	const profile = assertAbsolute("profileDir", profileDir);
	const profileRoot = join(userData, SNAPSHOT_ROOT, hash(hash(profile)));
	let item;
	try {
		item = lstatSync(profileRoot);
	} catch (cause) {
		if (isENOENT(cause)) return;
		throw cause;
	}
	if (item.isSymbolicLink() || !item.isDirectory()) fail("profile checkpoint directory has unsafe type");
	rmSync(profileRoot, {
		recursive: true,
		force: false
	});
}
//#endregion
//#region src/setup-wizard-state.ts
/** Per-Profile completion state for the launcher-owned Desktop Setup Wizard. */
const BIN_NAME = "dsh-plugin-desktop";
const LEGACY_STATE_VERSION = 1;
const STATE_VERSION = 2;
const SETUP_REVISION = 1;
const STATE_ROOT_DIRECTORY = "profile-setup";
const STATE_FILENAME = "state.json";
const STATE_DIRECTORY_MODE = 448;
const STATE_FILE_MODE = 384;
const MAX_STATE_BYTES = 4 * 1024;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const CHECK_POSIX_MODE = process.platform !== "win32";
function invalid(message) {
	return /* @__PURE__ */ new Error(`${BIN_NAME}: invalid Desktop Setup Wizard state: ${message}`);
}
function assertCanonicalVersion(label, value, error) {
	if (typeof value !== "string") throw error(`${label} must be a canonical Semantic Version`);
	const parsed = parseSemVer(value);
	if (parsed === null || parsed.version !== value) throw error(`${label} must be a canonical Semantic Version`);
	return value;
}
function assertSetupRevision(value, error) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw error("setupRevision must be a positive safe integer");
	return value;
}
function assertRecordedAt(value) {
	if (typeof value !== "string") throw invalid("recordedAt must be a canonical ISO timestamp");
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) throw invalid("recordedAt must be a canonical ISO timestamp");
	return value;
}
function normalizedVersions(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${BIN_NAME}: Setup Wizard versions must be an object`);
	const error = (message) => /* @__PURE__ */ new TypeError(`${BIN_NAME}: invalid Setup Wizard versions: ${message}`);
	return Object.freeze({
		desktopVersion: assertCanonicalVersion("desktopVersion", value.desktopVersion, error),
		dshVersion: assertCanonicalVersion("dshVersion", value.dshVersion, error),
		setupRevision: assertSetupRevision(value.setupRevision, error)
	});
}
function assertAbsolutePath(label, value) {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) throw new TypeError(`${BIN_NAME}: ${label} must be an absolute path without NUL`);
	return resolve(value);
}
/** Stable Profile identity used only as a private user-data path component. */
function desktopSetupWizardProfileHash(profileDir) {
	const normalized = assertAbsolutePath("Setup Wizard Profile directory", profileDir);
	return createHash("sha256").update(normalized).digest("hex");
}
/** Fixed marker path for one Profile under one Electron user-data directory. */
function desktopSetupWizardStatePath(userDataDir, profileDir) {
	const userData = assertAbsolutePath("Setup Wizard user-data directory", userDataDir);
	const profileHash = desktopSetupWizardProfileHash(profileDir);
	return join(userData, STATE_ROOT_DIRECTORY, profileHash, STATE_FILENAME);
}
function assertPrivateDirectory(path) {
	const info = lstatSync(path);
	if (!info.isDirectory() || info.isSymbolicLink()) throw invalid(`state directory must be a real directory: ${path}`);
	if (CHECK_POSIX_MODE && (info.mode & 511) !== STATE_DIRECTORY_MODE) throw invalid(`state directory permissions must be ${STATE_DIRECTORY_MODE.toString(8)}`);
}
function ensurePrivateDirectory(path) {
	mkdirSync(path, {
		recursive: true,
		mode: STATE_DIRECTORY_MODE
	});
	const info = lstatSync(path);
	if (!info.isDirectory() || info.isSymbolicLink()) throw invalid(`state directory must be a real directory: ${path}`);
	if (CHECK_POSIX_MODE && (info.mode & 511) !== STATE_DIRECTORY_MODE) chmodSync(path, STATE_DIRECTORY_MODE);
}
function existingPathInfo(path) {
	try {
		return lstatSync(path);
	} catch (cause) {
		if (cause.code === "ENOENT") return void 0;
		throw cause;
	}
}
function assertSafeStateTarget(path) {
	const info = existingPathInfo(path);
	if (info === void 0) return;
	if (!info.isFile() || info.isSymbolicLink()) throw invalid("marker must be a regular file");
	if (info.size > MAX_STATE_BYTES) throw invalid(`marker exceeds ${String(MAX_STATE_BYTES)} bytes`);
	if (CHECK_POSIX_MODE && (info.mode & 511) !== STATE_FILE_MODE) throw invalid(`marker permissions must be ${STATE_FILE_MODE.toString(8)}`);
}
function readStateBytes(path) {
	const pathInfo = existingPathInfo(path);
	if (pathInfo === void 0) return void 0;
	if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) throw invalid("marker must be a regular file");
	if (pathInfo.size > MAX_STATE_BYTES) throw invalid(`marker exceeds ${String(MAX_STATE_BYTES)} bytes`);
	if (CHECK_POSIX_MODE && (pathInfo.mode & 511) !== STATE_FILE_MODE) throw invalid(`marker permissions must be ${STATE_FILE_MODE.toString(8)}`);
	const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	try {
		const descriptorInfo = fstatSync(descriptor);
		if (!descriptorInfo.isFile() || descriptorInfo.size > MAX_STATE_BYTES) throw invalid(`marker must be a regular file within ${String(MAX_STATE_BYTES)} bytes`);
		if (descriptorInfo.dev !== pathInfo.dev || descriptorInfo.ino !== pathInfo.ino) throw invalid("marker changed while it was being opened");
		if (CHECK_POSIX_MODE && (descriptorInfo.mode & 511) !== STATE_FILE_MODE) throw invalid(`marker permissions must be ${STATE_FILE_MODE.toString(8)}`);
		const buffer = Buffer.alloc(4097);
		let bytesRead = 0;
		while (bytesRead < buffer.byteLength) {
			const count = readSync(descriptor, buffer, bytesRead, buffer.byteLength - bytesRead, null);
			if (count === 0) break;
			bytesRead += count;
		}
		if (bytesRead > MAX_STATE_BYTES) throw invalid(`marker exceeds ${String(MAX_STATE_BYTES)} bytes`);
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
		} catch {
			throw invalid("marker must contain valid UTF-8");
		}
	} finally {
		closeSync(descriptor);
	}
}
function parseState(text, expectedProfileHash) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw invalid("marker must contain valid JSON");
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid("marker root must be an object");
	const object = value;
	const keys = Object.keys(object).sort();
	const legacy = object.version === LEGACY_STATE_VERSION;
	const expectedKeys = legacy ? [
		"outcome",
		"profileHash",
		"version"
	] : [
		"desktopVersion",
		"dshVersion",
		"outcome",
		"profileHash",
		"recordedAt",
		"setupRevision",
		"version"
	];
	if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) throw invalid("marker contains unexpected fields");
	if (!legacy && object.version !== STATE_VERSION) throw invalid("marker has an unsupported version");
	if (typeof object.profileHash !== "string" || !HASH_PATTERN.test(object.profileHash) || object.profileHash !== expectedProfileHash) throw invalid("marker Profile identity does not match its path");
	if (object.outcome !== "completed" && object.outcome !== "skipped") throw invalid("marker outcome must be completed or skipped");
	if (legacy) return Object.freeze({
		version: LEGACY_STATE_VERSION,
		profileHash: object.profileHash,
		outcome: object.outcome
	});
	return Object.freeze({
		version: STATE_VERSION,
		profileHash: object.profileHash,
		outcome: object.outcome,
		desktopVersion: assertCanonicalVersion("desktopVersion", object.desktopVersion, invalid),
		dshVersion: assertCanonicalVersion("dshVersion", object.dshVersion, invalid),
		setupRevision: assertSetupRevision(object.setupRevision, invalid),
		recordedAt: assertRecordedAt(object.recordedAt)
	});
}
/** Read one Profile marker; absence means the Wizard still needs a decision. */
function readDesktopSetupWizardState(userDataDir, profileDir) {
	const path = desktopSetupWizardStatePath(userDataDir, profileDir);
	const root = dirname(dirname(path));
	const profileRoot = dirname(path);
	if (existingPathInfo(root) === void 0) return void 0;
	assertPrivateDirectory(root);
	if (existingPathInfo(profileRoot) === void 0) return void 0;
	assertPrivateDirectory(profileRoot);
	const text = readStateBytes(path);
	if (text === void 0) return void 0;
	return parseState(text, desktopSetupWizardProfileHash(profileDir));
}
/** Host boot can create usage history before onboarding finishes. Keep that run resumable. */
function desktopSetupWizardPending(userDataDir, profileDir) {
	const path = desktopSetupWizardStatePath(userDataDir, profileDir);
	if (existingPathInfo(dirname(dirname(path))) === void 0) return false;
	assertPrivateDirectory(dirname(dirname(path)));
	if (existingPathInfo(dirname(path)) === void 0) return false;
	assertPrivateDirectory(dirname(path));
	const value = readStateBytes(`${path}.pending`);
	if (value !== void 0 && value !== "pending\n") throw invalid("invalid pending marker");
	return value !== void 0;
}
async function beginDesktopSetupWizard(userDataDir, profileDir) {
	const path = desktopSetupWizardStatePath(userDataDir, profileDir);
	ensurePrivateDirectory(dirname(dirname(path)));
	ensurePrivateDirectory(dirname(path));
	assertSafeStateTarget(`${path}.pending`);
	await writeFileAtomic(`${path}.pending`, "pending\n", {
		mode: STATE_FILE_MODE,
		dirMode: STATE_DIRECTORY_MODE
	});
}
/** Resume the optional official login entry after applying Desktop preferences. */
function desktopSetupAccountPending(userDataDir, profileDir) {
	const path = desktopSetupWizardStatePath(userDataDir, profileDir);
	if (readDesktopSetupWizardState(userDataDir, profileDir) === void 0) return false;
	const text = readStateBytes(`${path}.account`);
	if (text !== void 0 && text !== "pending\n") throw invalid("invalid account continuation");
	return text !== void 0;
}
function dismissDesktopSetupAccount(userDataDir, profileDir) {
	if (!desktopSetupAccountPending(userDataDir, profileDir)) return;
	unlinkSync(`${desktopSetupWizardStatePath(userDataDir, profileDir)}.account`);
}
function clearPending(path) {
	if (existingPathInfo(`${path}.pending`) === void 0) return;
	assertSafeStateTarget(`${path}.pending`);
	unlinkSync(`${path}.pending`);
}
/** Setup is a one-time Profile decision; recorded versions are diagnostic only. */
function desktopSetupWizardRequired(state, currentVersions) {
	normalizedVersions(currentVersions);
	return state === void 0;
}
/** Atomically record explicit completion or an explicit skip for one Profile. */
async function completeOrSkipDesktopSetupWizard(userDataDir, profileDir, outcome, currentVersions, recordedAt = (/* @__PURE__ */ new Date()).toISOString()) {
	if (outcome !== "completed" && outcome !== "skipped") throw new TypeError(`${BIN_NAME}: invalid Desktop Setup Wizard outcome`);
	const path = desktopSetupWizardStatePath(userDataDir, profileDir);
	const profileHash = desktopSetupWizardProfileHash(profileDir);
	const versions = normalizedVersions(currentVersions);
	const canonicalRecordedAt = assertRecordedAt(recordedAt);
	ensurePrivateDirectory(dirname(dirname(path)));
	ensurePrivateDirectory(dirname(path));
	const state = Object.freeze({
		version: STATE_VERSION,
		profileHash,
		outcome,
		...versions,
		recordedAt: canonicalRecordedAt
	});
	assertSafeStateTarget(path);
	const current = readStateBytes(path);
	if (current !== void 0) parseState(current, profileHash);
	assertSafeStateTarget(`${path}.account`);
	if (outcome === "completed") await writeFileAtomic(`${path}.account`, "pending\n", {
		mode: STATE_FILE_MODE,
		dirMode: STATE_DIRECTORY_MODE
	});
	else if (existingPathInfo(`${path}.account`) !== void 0) unlinkSync(`${path}.account`);
	await writeFileAtomic(path, `${JSON.stringify(state, void 0, 2)}\n`, {
		mode: STATE_FILE_MODE,
		dirMode: STATE_DIRECTORY_MODE
	});
	if (CHECK_POSIX_MODE) chmodSync(path, STATE_FILE_MODE);
	clearPending(path);
	return state;
}
/** Clear one Profile marker without touching any other Profile's decision. */
function clearDesktopSetupWizardStateSync(userDataDir, profileDir) {
	const path = desktopSetupWizardStatePath(userDataDir, profileDir);
	if (existingPathInfo(dirname(dirname(path))) === void 0) return;
	assertPrivateDirectory(dirname(dirname(path)));
	if (existingPathInfo(dirname(path)) === void 0) return;
	assertPrivateDirectory(dirname(path));
	clearPending(path);
	assertSafeStateTarget(`${path}.account`);
	if (existingPathInfo(`${path}.account`) !== void 0) unlinkSync(`${path}.account`);
	if (existingPathInfo(path) === void 0) return;
	assertSafeStateTarget(path);
	unlinkSync(path);
}
/** Promise-compatible wrapper retained for existing asynchronous cleanup callers. */
async function clearDesktopSetupWizardState(userDataDir, profileDir) {
	clearDesktopSetupWizardStateSync(userDataDir, profileDir);
}
const desktopSetupWizardStateConstants = Object.freeze({
	version: STATE_VERSION,
	legacyVersion: LEGACY_STATE_VERSION,
	setupRevision: SETUP_REVISION,
	rootDirectory: STATE_ROOT_DIRECTORY,
	filename: STATE_FILENAME,
	maxBytes: MAX_STATE_BYTES,
	directoryMode: STATE_DIRECTORY_MODE,
	fileMode: STATE_FILE_MODE
});
//#endregion
//#region src/profile-channel-admission.ts
/** Read-only Stable/Beta Profile usage detection backed by each edition's private state. */
function absolute(label, value) {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !isAbsolute(value)) throw new TypeError(`dsh-plugin-desktop: ${label} must be an absolute path without NUL`);
	return resolve(value);
}
/** Resolve the current real userData and the other edition's canonical userData. */
function desktopReleaseUserDataLocations(appDataDir, currentUserDataDir) {
	const appData = absolute("application data directory", appDataDir);
	const current = Object.freeze({
		identity: DESKTOP_PRODUCT_IDENTITY,
		userDataDir: absolute("current user-data directory", currentUserDataDir)
	});
	const other = Object.freeze({
		identity: OTHER_DESKTOP_PRODUCT_IDENTITY,
		userDataDir: join(appData, OTHER_DESKTOP_PRODUCT_IDENTITY.productName)
	});
	return Object.freeze({
		current,
		other,
		all: Object.freeze([current, other])
	});
}
/** Prefer one healthy checkpoint; use Setup completion only when no checkpoint exists. */
function inspectDesktopReleaseProfileUsage(release, profileDir, profileName) {
	const checkpoint = inspectLatestDesktopProfileCheckpointUsage({
		userDataDir: release.userDataDir,
		profileDir,
		profileName,
		legacyDesktopPackageName: release.identity.packageName,
		legacyReleaseChannel: release.identity.releaseChannel
	});
	if (checkpoint.status === "invalid") return checkpoint;
	if (checkpoint.status === "valid") return {
		status: "valid",
		evidence: Object.freeze({
			...checkpoint.evidence,
			productName: release.identity.productName
		})
	};
	try {
		const setup = readDesktopSetupWizardState(release.userDataDir, profileDir);
		if (setup === void 0) return { status: "none" };
		if (setup.version === 1) return {
			status: "invalid",
			problem: "legacy Setup state has no recorded version or timestamp"
		};
		return {
			status: "valid",
			evidence: Object.freeze({
				source: "setup",
				recordedAt: setup.recordedAt,
				desktopPackageName: release.identity.packageName,
				productName: release.identity.productName,
				releaseChannel: release.identity.releaseChannel,
				desktopVersion: setup.desktopVersion,
				dshVersion: setup.dshVersion
			})
		};
	} catch (cause) {
		return {
			status: "invalid",
			problem: cause instanceof Error ? cause.message : String(cause)
		};
	}
}
/**
* Setup is shared by Profile identity across editions, unlike channel admission.
* Read legacy completion/skip markers too; their missing version is irrelevant
* here. Never stamp a new usage time merely because another edition was used.
*/
function hasDesktopProfileUsageHistory(locations, profileDir, profileName) {
	let problem;
	for (const release of locations.all) {
		try {
			if (readDesktopSetupWizardState(release.userDataDir, profileDir) !== void 0) return true;
		} catch (cause) {
			problem ??= cause instanceof Error ? cause : new Error(String(cause));
		}
		const checkpoint = inspectLatestDesktopProfileCheckpointUsage({
			userDataDir: release.userDataDir,
			profileDir,
			profileName,
			legacyDesktopPackageName: release.identity.packageName,
			legacyReleaseChannel: release.identity.releaseChannel
		});
		if (checkpoint.status === "valid") return true;
		if (checkpoint.status === "invalid") problem ??= new Error(checkpoint.problem);
	}
	if (problem !== void 0) throw problem;
	return false;
}
/** Decide whether the other Desktop package has the newest trustworthy evidence. */
function inspectDesktopProfileChannelAdmission(locations, profileDir, profileName) {
	const current = inspectDesktopReleaseProfileUsage(locations.current, profileDir, profileName);
	const other = inspectDesktopReleaseProfileUsage(locations.other, profileDir, profileName);
	if (other.status === "invalid") return current.status === "valid" ? {
		status: "allow",
		reason: "current-channel-latest"
	} : {
		status: "warn",
		reason: "uncertain"
	};
	if (current.status === "invalid") return other.status === "none" ? {
		status: "allow",
		reason: "current-channel-latest"
	} : {
		status: "warn",
		reason: "uncertain"
	};
	if (current.status === "none" && other.status === "none") return {
		status: "allow",
		reason: "new-profile"
	};
	if (other.status === "none") return {
		status: "allow",
		reason: "current-channel-latest"
	};
	if (current.status === "none") return {
		status: "warn",
		reason: "other-channel-latest",
		previous: other.evidence
	};
	const currentTime = Date.parse(current.evidence.recordedAt);
	const otherTime = Date.parse(other.evidence.recordedAt);
	if (currentTime > otherTime) return {
		status: "allow",
		reason: "current-channel-latest"
	};
	if (otherTime > currentTime) return {
		status: "warn",
		reason: "other-channel-latest",
		previous: other.evidence
	};
	return {
		status: "warn",
		reason: "uncertain"
	};
}
/** Clear only this Profile's cross-channel evidence after deletion or fresh creation. */
function clearDesktopProfileUsageHistory(locations, profileDir) {
	const visited = /* @__PURE__ */ new Set();
	for (const release of locations.all) {
		if (visited.has(release.userDataDir)) continue;
		visited.add(release.userDataDir);
		clearDesktopProfileCheckpoint(release.userDataDir, profileDir);
		clearDesktopSetupWizardStateSync(release.userDataDir, profileDir);
	}
}
//#endregion
export { createHostRuntime as A, socksProxyDiagnostic as C, desktop_office_exports as D, desktopPrimaryRuntime as E, HostRpc as M, resolveDesktopOfficeConfig as O, parsePacProxyResult as S, FileExporter as T, DesktopActionsService as _, beginDesktopSetupWizard as a, buildDesktopProxyOverlay as b, desktopSetupAccountPending as c, desktopSetupWizardStateConstants as d, dismissDesktopSetupAccount as f, DesktopSettingsController as g, clearDesktopProfileCheckpoint as h, inspectDesktopProfileChannelAdmission as i, runtimeSnapshot as j, bindNativeRuntime as k, desktopSetupWizardPending as l, DesktopProfileCheckpoint as m, desktopReleaseUserDataLocations as n, clearDesktopSetupWizardState as o, readDesktopSetupWizardState as p, hasDesktopProfileUsageHistory as r, completeOrSkipDesktopSetupWizard as s, clearDesktopProfileUsageHistory as t, desktopSetupWizardRequired as u, logInactiveStartupEntries as v, installAgentErrorLogging as w, desktopProxyEnvLookup as x, PROBE_URLS as y };

//# sourceMappingURL=profile-channel-admission-BCSNO_nW.js.map