cask "node-research" do
  arch arm: "arm64", intel: "x64"

  version "0.10.0"
  sha256 arm:   "19530d19995647d4cdc6e9b934030ff229d57dc279657d5a9e63bbac00304fa5",
         intel: "bbd9a7d6e6d4fd9369c3a07e6ff241c596e1ad98f73dfbad41f9bd0717eb43f1"

  url "https://github.com/westernCasa/node_browser/releases/download/v#{version}/NODE-#{version}-mac-#{arch}.dmg",
      verified: "github.com/westernCasa/node_browser/"
  name "NODE Research Browser"
  desc "Research browser that maps what you read and shares it with others"
  homepage "https://noderesearch.app/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "NODE.app"

  zap trash: [
    "~/Library/Application Support/NODE",
    "~/Library/Caches/app.scout.browser",
    "~/Library/Caches/app.scout.browser.ShipIt",
    "~/Library/Logs/NODE",
    "~/Library/Preferences/app.scout.browser.plist",
    "~/Library/Saved Application State/app.scout.browser.savedState",
  ]
end
