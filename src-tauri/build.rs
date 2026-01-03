fn main() {
  std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
  let mut config = prost_build::Config::new();
  // Ensure we generate the code
  config.compile_protos(&["../proto/ndgr.proto"], &["../proto"]).expect("failed to compile protos");
  println!("cargo:rerun-if-changed=../proto/ndgr.proto");
  tauri_build::build()
}
