#!/usr/bin/env bash
# Install the Android build tools locally. Linux x86_64, curl, unzip and Python 3 required.
# This installs the official SDK and accepts its development-tool license.
set -euo pipefail

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Use Android Studio with JDK 21, Android SDK 35 and Build Tools 35.0.0 on this platform.' >&2
  exit 1
fi

TOOLS_DIR="${LCC_TOOLS_DIR:-/workspace/.tools}"
mkdir -p "$TOOLS_DIR/downloads" "$TOOLS_DIR/android-home" "$TOOLS_DIR/gradle-home"
TOOLS_DIR="$(cd "$TOOLS_DIR" && pwd)"

if [[ ! -x "$TOOLS_DIR/jdk-21/bin/javac" ]]; then
  curl --fail --location --silent --show-error \
    https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz \
    --output "$TOOLS_DIR/downloads/jdk21.tar.gz"
  curl --fail --location --silent --show-error \
    https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz.sha256 \
    --output "$TOOLS_DIR/downloads/jdk21.sha256"
  JDK_SHA="$(tr -d '[:space:]' < "$TOOLS_DIR/downloads/jdk21.sha256")"
  printf '%s  %s\n' "$JDK_SHA" "$TOOLS_DIR/downloads/jdk21.tar.gz" | sha256sum --check
  mkdir -p "$TOOLS_DIR/jdk-21"
  tar -xzf "$TOOLS_DIR/downloads/jdk21.tar.gz" -C "$TOOLS_DIR/jdk-21" --strip-components=1
fi

SDK_DIR="$TOOLS_DIR/android-sdk"
SDK_MANAGER="$SDK_DIR/cmdline-tools/19.0/bin/sdkmanager"
if [[ ! -x "$SDK_MANAGER" ]]; then
  curl --fail --location --silent --show-error \
    https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip \
    --output "$TOOLS_DIR/downloads/commandlinetools-19.zip"
  # Published checksum from Google's Android SDK repository metadata.
  printf '%s  %s\n' 5fdcc763663eefb86a5b8879697aa6088b041e70 \
    "$TOOLS_DIR/downloads/commandlinetools-19.zip" | sha1sum --check
  SDK_TEMP="$(mktemp -d "$TOOLS_DIR/downloads/sdk.XXXXXX")"
  unzip -q "$TOOLS_DIR/downloads/commandlinetools-19.zip" -d "$SDK_TEMP"
  mkdir -p "$SDK_DIR/cmdline-tools/19.0"
  cp -a "$SDK_TEMP/cmdline-tools/." "$SDK_DIR/cmdline-tools/19.0/"
  rm -rf "$SDK_TEMP"
fi

export JAVA_HOME="$TOOLS_DIR/jdk-21"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export ANDROID_USER_HOME="$TOOLS_DIR/android-home"
export GRADLE_USER_HOME="$TOOLS_DIR/gradle-home"

# A cloud proxy CA is added to a COPY of the normal Java trust store.
# All HTTPS certificate and artifact checksum verification stays enabled.
TRUST_OPTIONS=''
if [[ -r /usr/local/share/ca-certificates/environment-proxy-ca.crt ]]; then
  TRUST_SOURCE="$JAVA_HOME/lib/security/cacerts"
  [[ ! -r /etc/ssl/certs/java/cacerts ]] || TRUST_SOURCE=/etc/ssl/certs/java/cacerts
  cp "$TRUST_SOURCE" "$TOOLS_DIR/java-cacerts"
  "$JAVA_HOME/bin/keytool" -importcert -noprompt -alias little-color-cloud-proxy \
    -file /usr/local/share/ca-certificates/environment-proxy-ca.crt \
    -keystore "$TOOLS_DIR/java-cacerts" -storepass changeit
  TRUST_OPTIONS="-Djavax.net.ssl.trustStore=$TOOLS_DIR/java-cacerts"
fi

PROXY_OPTIONS="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
proxy = urlparse(os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or '')
if proxy.hostname:
    port = proxy.port or 80
    print(f'-Dhttp.proxyHost={proxy.hostname} -Dhttp.proxyPort={port} -Dhttps.proxyHost={proxy.hostname} -Dhttps.proxyPort={port}')
PY
)"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} $TRUST_OPTIONS $PROXY_OPTIONS"

# Keep local build paths outside version control. No credentials are written.
ENV_FILE="$TOOLS_DIR/android-env.sh"
{
  printf 'export JAVA_HOME=%q\n' "$JAVA_HOME"
  printf 'export ANDROID_HOME=%q\n' "$ANDROID_HOME"
  printf 'export ANDROID_SDK_ROOT=%q\n' "$ANDROID_SDK_ROOT"
  printf 'export ANDROID_USER_HOME=%q\n' "$ANDROID_USER_HOME"
  printf 'export GRADLE_USER_HOME=%q\n' "$GRADLE_USER_HOME"
  printf 'export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/19.0/bin:$PATH"\n'
  printf 'export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} %s %s"\n' "$TRUST_OPTIONS" "$PROXY_OPTIONS"
} > "$ENV_FILE"

"$SDK_MANAGER" --sdk_root="$SDK_DIR" \
    'platform-tools' 'platforms;android-35' 'build-tools;34.0.0' 'build-tools;35.0.0' < <(printf 'y\n')

echo "Android tools ready. Run: source $ENV_FILE"
echo 'Then: npm ci && npm run android:build'
