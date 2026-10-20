import { A as createHostRuntime, D as desktop_office_exports, M as HostRpc, O as resolveDesktopOfficeConfig, T as FileExporter, _ as DesktopActionsService, g as DesktopSettingsController, t as clearDesktopProfileUsageHistory, v as logInactiveStartupEntries, w as installAgentErrorLogging, x as desktopProxyEnvLookup } from "./profile-channel-admission-BCSNO_nW.js";
import { n as DESKTOP_PACKAGE_NAME } from "./product-identity-DUPfNg4Q.js";
import { a as deleteDesktopProfile, c as selectDesktopProfile, i as createDesktopWebProfile, o as listDesktopProfiles, r as canDeleteDesktopProfile } from "./profile-manager-DZ2V7TPG.js";
import { n as createDesktopBrowserAccess } from "./desktop-browser-access-5-Ph3Uv7.js";
import { n as DesktopLanHttpsRuntime, t as DESKTOP_LAN_HTTPS_CA_PATH } from "./lan-https-runtime-6lVFk32q.js";
import { O as desktopLanBrowserUrls, _ as desktopProfilePreferencesFromSettings, b as installHostDeveloperLogging, g as clearDesktopProfilePreferences, k as desktopLoopbackBrowserUrl, u as observeDesktopPreferenceSettings, v as readDesktopProfilePreferences, y as writeDesktopProfilePreferences } from "./settings-bridge-mpB2I1Ui.js";
import { a as diagnosticRunId, o as initializeDeveloperLogging } from "./developer-logging-CZcXvx4-.js";
import { t as installProfilePackageResolver } from "./module-resolution-CcoXnXDo.js";
import { t as DesktopPluginPackages } from "./plugin-packages-DswBdCpI.js";
import { E as selectDesktopMarketProvider, s as desktopInstallAnchor, w as desktopMarketSnapshotWithEffective } from "./profile-BePNPvSL.js";
import { a as clearDesktopProfilePluginState, n as DesktopPluginsService } from "./desktop-plugins-CaaoCZ2N.js";
import { t as DesktopProfileService } from "./profile-service-BRZQTDkG.js";
import { t as createDesktopProfileBoot } from "./profile-context-BTGrNY9O.js";
import { t as LogFileSink } from "./log-files-CJwv9eE8.js";
import { t as disableAsarArchiveView } from "./asar-archive-policy-Cah5WU6P.js";
import { boot, installFailLoud, resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { provideCmdline } from "@deepseek-ai/dsh-cmdline";
import { installProxyFromEnvironment } from "@deepseek-ai/dsh-http-proxy";
import { DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot } from "@deepseek-ai/dsh-launch-environment";
//#region src/host-bootstrap.ts
/** Headless bootstrap for the Beta isolated Host experiment. */
function desktopProfileMarketSnapshot(market) {
	return Object.freeze({
		requested: market,
		effective: market,
		legacyDefaulted: false
	});
}
async function bootDesktopHost(options, runtime, browserAccess, lanHttps, bindHost, requestQuit) {
	const { prepared, profilePreferences, homeDir, activeProfileName, pluginManagementStatePath, selectionStatePath, marketUserDataDir, releaseUserDataLocations, desktopLaunchEnvironment, desktopPnpmBootstrap } = options;
	const createFreshDesktopProfile = (name) => {
		const created = createDesktopWebProfile(homeDir, name);
		clearDesktopProfileUsageHistory(releaseUserDataLocations, created.dir);
		return created;
	};
	const logSink = new LogFileSink(options.logDirectory, {
		maxFileBytes: 10 * 1024 * 1024,
		maxDirectoryBytes: 200 * 1024 * 1024
	});
	logSink.purgeOlderThan(7);
	initializeDeveloperLogging((level, line) => logSink.writeRecord(level, JSON.parse(line)), options.diagnosticRunId ?? diagnosticRunId());
	let fileExporter;
	let currentProfilePreferences = profilePreferences;
	let profilePreferencesWriteTail = Promise.resolve();
	let profilePreferencesStopping = false;
	const latestProfilePreferences = () => readDesktopProfilePreferences(marketUserDataDir, prepared.profile.dir) ?? currentProfilePreferences;
	const readProfilePreferences = () => {
		try {
			return latestProfilePreferences();
		} catch {
			return currentProfilePreferences;
		}
	};
	const enqueueProfilePreferencesWrite = (update) => {
		if (profilePreferencesStopping) return Promise.reject(/* @__PURE__ */ new Error(`${DESKTOP_PACKAGE_NAME}: Profile preferences are stopping`));
		const write = profilePreferencesWriteTail.then(async () => {
			const next = update(latestProfilePreferences());
			const stored = await writeDesktopProfilePreferences(marketUserDataDir, prepared.profile.dir, next);
			currentProfilePreferences = stored;
			return stored;
		});
		profilePreferencesWriteTail = write.then(() => void 0, () => void 0);
		return write;
	};
	const flushProfilePreferencesWrites = async () => {
		profilePreferencesStopping = true;
		await profilePreferencesWriteTail;
	};
	let effectiveMarket = prepared.market.effective;
	let effectiveAa = prepared.aaEnabled;
	const releasePackageResolver = installProfilePackageResolver(prepared.bareModuleBaseUrl);
	const profileBoot = createDesktopProfileBoot(prepared, desktopPnpmBootstrap, { onManagedBundlesChanged: (state) => {
		effectiveMarket = state.effectiveMarket;
		effectiveAa = state.effectiveAa;
		enqueueProfilePreferencesWrite((current) => desktopProfilePreferencesFromSettings(current, current.notifications, state.requestedMarket, state.requestedAa)).then(() => selectDesktopMarketProvider(marketUserDataDir, state.requestedMarket)).catch(() => {});
	} });
	const ctx = await boot(DESKTOP_PACKAGE_NAME, prepared.rootConfig, prepared.patches, async (hostCtx) => {
		profileBoot.prepare(hostCtx);
		hostCtx.loader.internal = void 0;
		bindHost(hostCtx);
		hostCtx.effect(() => () => logSink.close(), "dsh-plugin-desktop: Host log sink");
		hostCtx.effect(() => async () => {
			await flushProfilePreferencesWrites();
		}, "dsh-plugin-desktop: flush Profile preference writes");
		hostCtx.effect(() => releasePackageResolver, "dsh-plugin-desktop: profile package resolution");
		await hostCtx.plugin(DesktopPluginPackages);
		hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, desktopLaunchEnvironment);
		hostCtx.provide("desktopBrowserAccess", browserAccess);
		hostCtx.provide("desktopLanHttps", lanHttps);
		hostCtx.provide("desktopRuntime", runtime);
		hostCtx.provide("desktopPnpmBootstrap", desktopPnpmBootstrap);
		await hostCtx.plugin(DesktopActionsService, {
			openTerminal: () => {
				runtime.openTerminal();
			},
			requestRestart: () => runtime.requestRestart()
		});
		await hostCtx.plugin(DesktopPluginsService, {
			profileName: activeProfileName,
			homeDir,
			statePath: pluginManagementStatePath,
			installAnchor: desktopInstallAnchor()
		});
		if (logSink !== void 0) {
			fileExporter = new FileExporter(logSink);
			hostCtx.logger.exporter(fileExporter);
		}
		installAgentErrorLogging(hostCtx);
		installHostDeveloperLogging(hostCtx);
		// Pet runtime does not mount Office authoring or its bundled dependencies.
		await hostCtx.plugin(DesktopProfileService, {
			current: {
				name: activeProfileName,
				dir: prepared.profile.dir
			},
			create: (name) => createFreshDesktopProfile(name),
			list: () => listDesktopProfiles(homeDir),
			canDelete: (name) => canDeleteDesktopProfile({
				home: homeDir,
				selectionStatePath,
				currentProfileName: activeProfileName
			}, name),
			delete: async (name) => {
				const profileDir = resolveProfileDir(name, homeDir);
				await deleteDesktopProfile({
					home: homeDir,
					selectionStatePath,
					currentProfileName: activeProfileName,
					clearDisabledState: () => clearDesktopProfilePluginState(pluginManagementStatePath, name),
					clearCheckpoint: async () => {
						clearDesktopProfileUsageHistory(releaseUserDataLocations, profileDir);
					}
				}, name);
				try {
					await clearDesktopProfilePreferences(marketUserDataDir, profileDir);
				} catch (cause) {
					hostCtx.logger.error(`${DESKTOP_PACKAGE_NAME}: deleted Profile left stale preference state: ${cause instanceof Error ? cause.message : String(cause)}`);
				}
			},
			persistSelection: (name) => {
				selectDesktopProfile(selectionStatePath, homeDir, name);
			},
			requestRestart: () => runtime.requestRestart()
		});
		let pendingSettingsRestart;
		const scheduleSettingsRestart = () => {
			pendingSettingsRestart ??= setImmediate(() => {
				pendingSettingsRestart = void 0;
				runtime.requestRestart().catch((cause) => {
					hostCtx.logger.error(`${DESKTOP_PACKAGE_NAME}: failed to restart after Desktop setting change: ${cause instanceof Error ? cause.message : String(cause)}`);
				});
			});
		};
		hostCtx.effect(() => () => {
			if (pendingSettingsRestart !== void 0) clearImmediate(pendingSettingsRestart);
			pendingSettingsRestart = void 0;
		}, "dsh-plugin-desktop: pending Desktop settings restart");
		const readMarket = () => desktopMarketSnapshotWithEffective(desktopProfileMarketSnapshot(readProfilePreferences().market), effectiveMarket);
		hostCtx.provide("desktopSettingsController", new DesktopSettingsController({
			profiles: hostCtx.desktopProfiles,
			readMarket,
			readAa: () => ({
				requested: readProfilePreferences().aaEnabled === true,
				effective: effectiveAa
			}),
			selectAa: async (enabled) => {
				await enqueueProfilePreferencesWrite((current) => desktopProfilePreferencesFromSettings(current, current.notifications, current.market, enabled));
			},
			readWeb: () => {
				const port = hostCtx.webServer.port;
				if (port === void 0) throw new Error("dsh-plugin-desktop: the WebServer has not bound a port");
				const lan = lanHttps.snapshot();
				const lanOrigins = lan.state === "ready" && lan.actualPort !== null ? desktopLanBrowserUrls(lan.actualPort, lan.addresses) : [];
				return {
					localUrl: hostCtx.connection.authenticatedUrl(desktopLoopbackBrowserUrl(port)),
					lanUrls: lanOrigins.map((url) => hostCtx.connection.authenticatedUrl(url)),
					lanState: lan.state,
					lanError: lan.errorCode,
					lanCaFingerprint: lan.caFingerprint,
					lanCaUrls: lanOrigins.map((origin) => {
						return new URL(DESKTOP_LAN_HTTPS_CA_PATH, origin).href;
					})
				};
			},
			selectMarket: async (provider) => {
				await enqueueProfilePreferencesWrite((current) => desktopProfilePreferencesFromSettings(current, current.notifications, provider, current.aaEnabled === true));
				return desktopMarketSnapshotWithEffective(await selectDesktopMarketProvider(marketUserDataDir, provider), effectiveMarket);
			},
			scheduleRestart: scheduleSettingsRestart,
			scheduleRecoveryRestart: () => {
				runtime.requestRecoveryRestart().catch((cause) => {
					hostCtx.logger.error(`${DESKTOP_PACKAGE_NAME}: failed to restart in recovery mode: ${cause instanceof Error ? cause.message : String(cause)}`);
				});
			},
			openTerminal: () => {
				runtime.openTerminal();
			},
			reloadRenderer: () => {
				runtime.reloadRenderer();
			},
			toggleDeveloperTools: () => {
				runtime.toggleDeveloperTools();
			},
			exportDiagnostics: () => runtime.exportDiagnostics()
		}));
		provideCmdline(hostCtx, {
			args: ["--port", String(prepared.port)],
			exit: requestQuit
		});
	}, prepared.bareModuleBaseUrl).catch((cause) => {
		releasePackageResolver();
		throw cause;
	});
	bindHost(ctx);
	profileBoot.markReady();
	observeDesktopPreferenceSettings(ctx, fileExporter, enqueueProfilePreferencesWrite);
	logInactiveStartupEntries(ctx, DESKTOP_PACKAGE_NAME);
	return () => ({
		aaRuntime: ctx.get("agentsAnywhereRuntime") !== void 0,
		aaOnboarding: ctx.get("agentsAnywhereOnboarding") !== void 0
	});
}
//#endregion
//#region src/host-process-entry.ts
/** Utility-process entrypoint. No BrowserWindow or Electron main APIs are imported here. */
disableAsarArchiveView(import.meta.url);
const parentPort = process.parentPort;
if (!parentPort) throw new Error("DSH Host must be started by the Desktop supervisor");
const rpc = new HostRpc({
	send: (message) => parentPort.postMessage(message),
	listen: (receive) => {
		const listener = (event) => receive(event.data);
		parentPort.on("message", listener);
		return () => {
			parentPort.removeListener("message", listener);
		};
	}
}, 12e4);
let host;
let inspectServices = () => ({
	aaRuntime: false,
	aaOnboarding: false
});
rpc.handle("status", () => ({
	pid: process.pid,
	services: inspectServices()
}));
let starting = false;
let stopping = false;
let lan;
let releaseProxy;
let releaseTask;
/** Tear this generation down once, whether the supervisor asked or a fatal error forces it. */
const release = () => releaseTask ??= (async () => {
	stopping = true;
	await host?.fiber.dispose();
	await lan?.stop();
	await releaseProxy?.();
	releaseProxy = void 0;
})();
rpc.handle("stop", release);
installFailLoud(DESKTOP_PACKAGE_NAME, process, release);
rpc.handle("boot", async (args) => {
	const [wire, snapshot, token] = args;
	const options = {
		...wire,
		desktopLaunchEnvironment: createLaunchEnvironmentSnapshot(wire.launchEnvironmentLayers)
	};
	if (starting || stopping) throw new Error("DSH Host generation already started or stopped");
	starting = true;
	releaseProxy = await installProxyFromEnvironment(desktopProxyEnvLookup(options.desktopLaunchEnvironment, options.desktopProxyOverlay), (message) => process.stderr.write(`dsh-plugin-desktop: ${message}\n`));
	process.stderr.write("dsh-plugin-desktop: host outbound proxy policy installed\n");
	try {
		const runtime = createHostRuntime(rpc, snapshot);
		const browser = createDesktopBrowserAccess(options.prepared.mode === "compatibility" && options.prepared.openBrowser, token);
		lan = new DesktopLanHttpsRuntime({
			addresses: options.prepared.lanAddresses,
			requestedPort: 0,
			prepareCertificate: () => rpc.call("certificate")
		});
		inspectServices = await bootDesktopHost(options, runtime, browser, lan, (value) => {
			host = value;
		}, (code) => {
			rpc.call("quit", [code]).catch(() => {});
		});
		if (stopping) {
			await host?.fiber.dispose();
			throw new Error("DSH Host stopped during startup");
		}
		await runtime.mountScheduled();
		return { pid: process.pid };
	} catch (cause) {
		await releaseProxy?.();
		releaseProxy = void 0;
		throw cause;
	}
});
//#endregion
export {};

//# sourceMappingURL=host-process-entry.js.map