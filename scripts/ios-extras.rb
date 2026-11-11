# frozen_string_literal: true
# `npx cap add ios` / `npx cap sync ios` のあとで、Xcode のプロジェクトに足す（GitHub Actions の macOS で動かす）：
#   - アプリ本体：ショートカット・Siri（App Intents）とバックグラウンドの更新（ios-assets/app-extra/*.swift）
#   - ウィジェットの拡張機能 HibiWidgets：ホーム画面・ロック画面のウィジェットと、ライブアクティビティ（ios-assets/widgets）
# 何度動かしても同じ結果になる。
require 'xcodeproj'
require 'fileutils'

root = File.expand_path('..', __dir__)
proj = Xcodeproj::Project.open(File.join(root, 'ios/App/App.xcodeproj'))
app = proj.targets.find { |t| t.name == 'App' } or abort('App target not found')

# ---- app target
app_dir = File.join(root, 'ios/App/App')
app_grp = proj.main_group.find_subpath('App', false) or abort('App group not found')
Dir[File.join(root, 'ios-assets/app-extra/*.swift')].each do |src|
  name = File.basename(src)
  FileUtils.cp(src, File.join(app_dir, name))
  ref = app_grp.files.find { |f| f.path == name } || app_grp.new_reference(name)
  app.add_file_references([ref]) unless app.source_build_phase.files_references.include?(ref)
end

# ---- widget extension
wdir = File.join(root, 'ios/App/HibiWidgets')
FileUtils.mkdir_p(wdir)
FileUtils.cp(File.join(root, 'ios-assets/widgets/HibiWidgets.swift'), wdir)
FileUtils.cp(File.join(root, 'ios-assets/widgets/Info.plist'), wdir)
FileUtils.cp(File.join(root, 'native/hibi-llm/ios/Sources/HibiLLMPlugin/HibiShared.swift'), wdir)
wt = proj.targets.find { |t| t.name == 'HibiWidgets' } || proj.new_target(:app_extension, 'HibiWidgets', :ios, '17.0', nil, :swift)
grp = proj.main_group.find_subpath('HibiWidgets', true)
grp.set_source_tree('<group>')
grp.set_path('HibiWidgets')
%w[HibiWidgets.swift HibiShared.swift].each do |n|
  ref = grp.files.find { |f| f.path == n } || grp.new_reference(n)
  wt.add_file_references([ref]) unless wt.source_build_phase.files_references.include?(ref)
end
grp.new_reference('Info.plist') unless grp.files.any? { |f| f.path == 'Info.plist' }
mv = app.build_configurations.first.build_settings['MARKETING_VERSION'] || '1.0'
cv = app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION'] || '1'
wt.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'jp.weakestandstrongest.hibi.widgets'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'HibiWidgets/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['MARKETING_VERSION'] = mv
  s['CURRENT_PROJECT_VERSION'] = cv
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['CODE_SIGNING_ALLOWED'] = 'NO'
  # AlarmKit（スヌーズ中の表示）は iOS 26 から。それより前の iPhone でもウィジェットが動くように、弱くつなぐ
  s['OTHER_LDFLAGS'] = ['$(inherited)', '-weak_framework', 'AlarmKit']
end
app.add_dependency(wt) unless app.dependencies.any? { |d| d.target == wt }
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } || app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
unless embed.files_references.include?(wt.product_reference)
  bf = embed.add_file_reference(wt.product_reference, true)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
proj.save
puts 'added: App Intents + background refresh (App), HibiWidgets extension'
