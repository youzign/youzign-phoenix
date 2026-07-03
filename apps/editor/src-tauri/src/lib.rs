#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(debug_assertions))]
    {
        const LOCALHOST_PORT: u16 = 1420;

        // WKWebView blocks module workers from Tauri's custom protocol, which
        // breaks local ONNX background removal. Serving built assets from a
        // fixed loopback HTTP origin restores normal browser worker semantics.
        // Security tradeoff: the app now exposes its bundled frontend on
        // localhost while running, so keep the port fixed/known and do not add
        // privileged HTTP endpoints to this server.
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running Youzign");
}
