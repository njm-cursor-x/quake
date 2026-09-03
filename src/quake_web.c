/* Web platform extras for Quake (gamepad).
 *
 * The SDL video/input loop lives in vid_sdl.c / sys_sdl.c (from Qwasm).
 * This file adds W3C-standard gamepad polling on top of that, matching the
 * sibling Doom web port's stick layout.
 */

#include "quakedef.h"

#include <SDL.h>
#include <string.h>

enum
{
	PAD_AXIS_LX = 0,
	PAD_AXIS_LY = 1,
	PAD_AXIS_RX = 2,
	PAD_AXIS_RY = 3,

	PAD_BTN_A = 0,
	PAD_BTN_B = 1,
	PAD_BTN_X = 2,
	PAD_BTN_Y = 3,
	PAD_BTN_L1 = 4,
	PAD_BTN_R1 = 5,
	PAD_BTN_L2 = 6,
	PAD_BTN_R2 = 7,
	PAD_BTN_START = 9,
	PAD_BTN_L3 = 10
};

#define PAD_DEADZONE 8000
#define PAD_LOOK_DIVISOR 400

static SDL_Joystick *pad;
static int pad_btn_old[16];

static int pad_axis(int axis)
{
	int value;

	if (!pad)
		return 0;
	value = SDL_JoystickGetAxis(pad, axis);
	if (value > -PAD_DEADZONE && value < PAD_DEADZONE)
		return 0;
	return value;
}

static void pad_key(int button, int quake_key)
{
	int down = SDL_JoystickGetButton(pad, button) ? 1 : 0;

	if (down != pad_btn_old[button])
	{
		Key_Event(quake_key, down);
		pad_btn_old[button] = down;
	}
}

void QuakeWeb_InitGamepad(void)
{
	SDL_InitSubSystem(SDL_INIT_JOYSTICK);
	memset(pad_btn_old, 0, sizeof(pad_btn_old));
}

void QuakeWeb_PollGamepad(float *mouse_x, float *mouse_y)
{
	int lx, ly, rx, ry;

	if (pad == NULL)
	{
		if (SDL_NumJoysticks() < 1)
			return;
		pad = SDL_JoystickOpen(0);
		if (pad == NULL)
			return;
		Con_Printf("Gamepad: %s\n", SDL_JoystickName(pad));
	}

	SDL_JoystickUpdate();

	pad_key(PAD_BTN_R2, K_MOUSE1);
	pad_key(PAD_BTN_A, K_SPACE);       /* jump */
	pad_key(PAD_BTN_X, K_ENTER);       /* use / menu select */
	pad_key(PAD_BTN_B, K_ESCAPE);
	pad_key(PAD_BTN_START, K_ESCAPE);
	pad_key(PAD_BTN_L1, '[');         /* prev weapon (default bind) */
	pad_key(PAD_BTN_R1, ']');         /* next weapon */
	pad_key(PAD_BTN_Y, 'r');           /* rocket launcher shortcut if bound */

	/* Face movement through the keyboard path so existing binds apply. */
	lx = pad_axis(PAD_AXIS_LX);
	ly = pad_axis(PAD_AXIS_LY);
	{
		static int was_w, was_s, was_a, was_d;
		int w = ly < 0, s = ly > 0, a = lx < 0, d = lx > 0;
		if (w != was_w) { Key_Event('w', w); was_w = w; }
		if (s != was_s) { Key_Event('s', s); was_s = s; }
		if (a != was_a) { Key_Event('a', a); was_a = a; }
		if (d != was_d) { Key_Event('d', d); was_d = d; }
	}

	rx = pad_axis(PAD_AXIS_RX);
	ry = pad_axis(PAD_AXIS_RY);
	if (rx || ry)
	{
		*mouse_x += (float)rx / (float)PAD_LOOK_DIVISOR;
		*mouse_y += (float)ry / (float)PAD_LOOK_DIVISOR;
	}

	(void)PAD_BTN_L2;
	(void)PAD_BTN_L3;
}
