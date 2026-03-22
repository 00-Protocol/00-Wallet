# BCH Pubkey Indexer — Start9 Package Makefile
# Produces: bch-pubkey-indexer.s9pk

PACKAGE_ID = bch-pubkey-indexer
VERSION    = 1.0.0
S9PK       = $(PACKAGE_ID).s9pk

.PHONY: all build pack verify clean

all: $(S9PK)

# Build Docker image and pack into .s9pk
build:
	docker build \
		-f start9/Dockerfile \
		-t $(PACKAGE_ID):$(VERSION) \
		--platform linux/amd64 \
		../
	docker build \
		-f start9/Dockerfile.compat \
		-t $(PACKAGE_ID)-compat:$(VERSION) \
		--platform linux/amd64 \
		../

$(S9PK): build
	start-sdk pack

verify: $(S9PK)
	start-sdk verify s9pk $(S9PK)

clean:
	rm -f $(S9PK)

# ── ARM64 (for Raspberry Pi / Start9 Pure) ────────────────────────────────────
build-arm:
	docker build \
		-f start9/Dockerfile \
		-t $(PACKAGE_ID):$(VERSION)-arm64 \
		--platform linux/arm64 \
		../
