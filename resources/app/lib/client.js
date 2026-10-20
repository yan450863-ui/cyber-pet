// Pet desktop carrier: only report boot health. Native chrome owns window controls.
window.__ModuleLoader__.load({id:'dsh-plugin-desktop',factory(){
var RENDERER_BOOT_REPORT_PATH = "/_dsh/desktop/renderer-boot";
		//#endregion
		//#region src/client/boot-health.ts
		var ACTIVE_FIBER_STATE = 2;
		/** Wait for client Loader settlement and summarize entries that did not activate. */
		async function rendererBootReport(loader) {
			let error;
			try {
				await loader.await();
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}
			const plugins = [...loader.entries()].filter((entry) => entry.fiber?.state !== ACTIVE_FIBER_STATE).map((entry) => entry.options.name);
			return error === void 0 && plugins.length === 0 ? { status: "healthy" } : {
				status: "failed",
				plugins,
				...error === void 0 ? {} : { error }
			};
		}
		/** Send the settled client Loader outcome to the same-origin desktop Host. */
		async function sendRendererBootReport(loader, request = globalThis.fetch) {
			const report = await rendererBootReport(loader);
			await postRendererBootReport(report, request);
			return report;
		}
		async function postRendererBootReport(report, request) {
			const response = await request(RENDERER_BOOT_REPORT_PATH, {
				method: "POST",
				cache: "no-store",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(report)
			});
			if (!response.ok) throw new Error(`dsh-plugin-desktop: renderer boot report failed with HTTP ${String(response.status)}`);
		}
		/** Defer health reporting until the current client plugin activation has completed. */
		function startRendererBootReporter(loader, request = globalThis.fetch) {
			let active = true;
			const timer = setTimeout(() => {
				rendererBootReport(loader).then(async (report) => {
					if (active) await postRendererBootReport(report, request);
				}).catch((cause) => {
					console.error("dsh-plugin-desktop: failed to report renderer boot health", cause);
				});
			}, 0);
			return () => {
				active = false;
				clearTimeout(timer);
			};
		}
		//#endregion
		
return {apply(ctx){ctx.effect(()=>startRendererBootReporter(ctx.loader),'Pet renderer boot health')}}
}})
