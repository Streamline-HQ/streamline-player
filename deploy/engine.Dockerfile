# syntax=docker/dockerfile:1.29

# The engine without Nix: `docker build -f deploy/engine.Dockerfile .` from the
# repository root. `nix build .#engine-image` is the reference build.
#
# Base images are pinned by digest. Refresh one with
# `docker buildx imagetools inspect <image>:<tag> --format '{{.Manifest.Digest}}'`.

FROM rust:1.99.1-slim-trixie@sha256:f6c4a35d21dbb3c89d7a8d056c193e94fc09037f2b58dd858b09c39a47dd02d7 AS build
WORKDIR /src

# Packaged neither by Debian nor on crates.io. The version Nix ships.
# internal-font in place of the default system-font: the plot command is the
# only user of a font, and the default links fontconfig.
ARG DOVI_TOOL_VERSION=2.3.4
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo install --locked --root /out \
      --no-default-features --features internal-font \
      --git https://github.com/quietvoid/dovi_tool --tag "${DOVI_TOOL_VERSION}" dovi_tool

# Every workspace member, not just engine/: cargo refuses a workspace whose
# members are missing, even when building one of them. rust-toolchain.toml stays
# out, or rustup would fetch its Android and Windows targets.
COPY Cargo.toml Cargo.lock ./
COPY engine/ engine/
COPY src-tauri/ src-tauri/
COPY plugins/ plugins/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p engine && \
    cp target/release/engine /out/bin/engine

# sid, not trixie: it carries ffmpeg 9, the version the engine is built and
# tested against (trixie has 7.1). Debian's ffmpeg links libplacebo to the
# Vulkan loader, which the VAAPI tonemap needs, and has chromaprint for the
# intro job; Alpine's lacks chromaprint.
FROM debian:sid-slim@sha256:07a3205e8583fdff12d2b05bd030f50437e9fd340ee616df0c05dc77af75767b
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ffmpeg mesa-va-drivers mesa-vulkan-drivers && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /out/bin/ /usr/local/bin/
LABEL org.opencontainers.image.source=https://github.com/Streamline-HQ/streamline-player \
      org.opencontainers.image.description="Streamline's streaming engine"

# The render node is usually root:render 0660: give the container that gid at
# run time (`--group-add`, Kubernetes supplementalGroups).
USER 1000:1000
EXPOSE 8097
ENTRYPOINT ["/usr/local/bin/engine"]
CMD ["--config", "/etc/engine/config.yaml"]
