# Browser Quake — Emscripten + GLQuake via GL4ES
# Engine sources: third_party/quake (Qwasm / id GPL Quake)
# Platform overlays: src/*.c

ENGINE_DIR := third_party/quake/WinQuake
GL4ES_DIR := third_party/gl4es
GL4ES_LIB := $(GL4ES_DIR)/lib/libGL.a
OBJDIR := build
DIST := dist
OUTPUT := $(DIST)/quake

CC := emcc

CFLAGS += -O2 -ffast-math \
	-I$(ENGINE_DIR) \
	-I$(GL4ES_DIR)/include \
	-sUSE_SDL=2 \
	-DSDL \
	-DGLQUAKE \
	-Wno-implicit-function-declaration \
	-Wno-unused-parameter \
	-Wno-missing-field-initializers \
	-Wno-sign-compare \
	-Wno-pointer-sign \
	-Wno-deprecated-non-prototype

LDFLAGS += -O2 \
	-sUSE_SDL=2 \
	-sFULL_ES2=1 \
	-sMODULARIZE=1 \
	-sEXPORT_NAME=createQuake \
	-sINVOKE_RUN=0 \
	-sFORCE_FILESYSTEM=1 \
	-sALLOW_MEMORY_GROWTH=1 \
	-sINITIAL_MEMORY=134217728 \
	-sSTACK_SIZE=2097152 \
	-sASSERTIONS=0 \
	-sENVIRONMENT=web \
	-sEXPORTED_RUNTIME_METHODS='["FS","callMain","IDBFS"]' \
	-sEXPORTED_FUNCTIONS='["_main"]' \
	-sNO_EXIT_RUNTIME=1 \
	-lidbfs.js \
	$(GL4ES_LIB) \
	-lm

# Core Quake + GLQuake renderer (C only — no x86 asm)
SRC_ENGINE := \
	chase.c cl_demo.c cl_input.c cl_main.c cl_parse.c cl_tent.c \
	cmd.c common.c console.c crc.c cvar.c \
	host.c host_cmd.c keys.c mathlib.c menu.c \
	net_loop.c net_main.c net_vcr.c net_none.c \
	pr_cmds.c pr_edict.c pr_exec.c r_part.c \
	sbar.c snd_dma.c snd_mem.c snd_mix.c \
	sv_main.c sv_move.c sv_phys.c sv_user.c \
	view.c wad.c world.c zone.c \
	gl_draw.c gl_mesh.c gl_model.c gl_refrag.c gl_rlight.c \
	gl_rmain.c gl_rmisc.c gl_rsurf.c gl_screen.c gl_warp.c

SRC_PLATFORM := sys_sdl.c vid_sdl.c snd_sdl.c cd_null.c quake_web.c

OBJS := $(addprefix $(OBJDIR)/,$(SRC_ENGINE:.c=.o)) \
	$(addprefix $(OBJDIR)/,$(SRC_PLATFORM:.c=.o))

.PHONY: all clean package check-dist gl4es

all: package

$(OBJDIR):
	mkdir -p $(OBJDIR)

$(DIST):
	mkdir -p $(DIST)

$(OBJDIR)/%.o: $(ENGINE_DIR)/%.c | $(OBJDIR)
	@echo [CC] $<
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR)/sys_sdl.o: src/sys_sdl.c | $(OBJDIR)
	@echo [CC] $<
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR)/vid_sdl.o: src/vid_sdl.c | $(OBJDIR)
	@echo [CC] $<
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR)/snd_sdl.o: src/snd_sdl.c | $(OBJDIR)
	@echo [CC] $<
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR)/cd_null.o: src/cd_null.c | $(OBJDIR)
	@echo [CC] $<
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR)/quake_web.o: src/quake_web.c | $(OBJDIR)
	@echo [CC] $<
	$(CC) $(CFLAGS) -c $< -o $@

$(OUTPUT).js: $(OBJS) $(GL4ES_LIB) | $(DIST)
	@echo [LD] $@
	$(CC) $(CFLAGS) $(OBJS) -o $@ $(LDFLAGS)

SHA256 := $(shell command -v sha256sum >/dev/null 2>&1 && echo sha256sum || echo 'shasum -a 256')

SHIPPABLE_DATA := quake106.zip

package: $(OUTPUT).js
	cp web/index.html web/app.js web/styles.css $(DIST)/
	mkdir -p $(DIST)/vendor $(DIST)/data
	cp web/vendor/lha.js $(DIST)/vendor/
	rm -f $(DIST)/data/*
	cp data/$(SHIPPABLE_DATA) $(DIST)/data/
	rm -f $(DIST)/COPYING
	cp COPYING $(DIST)/
	@$(SHA256) $(OUTPUT).wasm $(OUTPUT).js | $(SHA256) | cut -c1-16 > $(DIST)/build.txt
	@echo "[ID] build $$(cat $(DIST)/build.txt)"
	@$(MAKE) --no-print-directory check-dist

.PHONY: check-dist
check-dist:
	@extra=$$(ls $(DIST)/data 2>/dev/null | grep -v '^$(SHIPPABLE_DATA)$$' || true); \
	if [ -n "$$extra" ]; then \
		echo "ERROR: non-shippable game data in $(DIST)/data:" >&2; \
		echo "$$extra" | sed 's/^/  /' >&2; \
		exit 1; \
	fi; \
	if ls $(DIST)/data/*.pak $(DIST)/data/*.PAK $(DIST)/id1 2>/dev/null | grep -q .; then \
		echo "ERROR: loose PAK files must not be packaged (ship $(SHIPPABLE_DATA) only)" >&2; \
		exit 1; \
	fi; \
	echo "[OK] dist ships only $(SHIPPABLE_DATA)"

clean:
	rm -rf $(OBJDIR) $(DIST)
