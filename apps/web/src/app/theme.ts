import { definePreset } from "@primeuix/themes"
import Aura from "@primeuix/themes/aura"

const canvas = "#010102"
const surface1 = "#0d0e12"
const surface2 = "#14161c"
const surface3 = "#1a1d24"
const surface4 = "#20242d"
const hairline = "#23252a"
const hairlineStrong = "#343844"
const ink = "#f7f8f8"
const inkMuted = "#d0d6e0"
const inkSubtle = "#8a8f98"
const primary = "#5e6ad2"
const primaryHover = "#828fff"
const primaryFocus = "#5e69d1"

const surfacePalette = {
  0: "#ffffff",
  50: "#f7f8f8",
  100: "#d0d6e0",
  200: "#b4bbc7",
  300: "#8a8f98",
  400: "#62666d",
  500: "#343844",
  600: hairline,
  700: surface4,
  800: surface3,
  900: surface2,
  950: canvas,
}

const linearColorScheme = {
  surface: surfacePalette,
  primary: {
    color: primary,
    contrastColor: "#ffffff",
    hoverColor: primaryHover,
    activeColor: primaryFocus,
  },
  highlight: {
    background: "color-mix(in srgb, #5e6ad2 22%, transparent)",
    focusBackground: "color-mix(in srgb, #5e6ad2 28%, transparent)",
    color: ink,
    focusColor: ink,
  },
  mask: {
    background: "rgba(0, 0, 0, 0.72)",
    color: ink,
  },
  formField: {
    background: surface1,
    disabledBackground: surface2,
    filledBackground: surface1,
    filledHoverBackground: surface2,
    filledFocusBackground: surface1,
    borderColor: hairline,
    hoverBorderColor: hairlineStrong,
    focusBorderColor: primaryFocus,
    color: ink,
    disabledColor: "#62666d",
    placeholderColor: inkSubtle,
    floatLabelColor: inkSubtle,
    floatLabelFocusColor: primaryHover,
    floatLabelActiveColor: inkMuted,
    iconColor: inkSubtle,
    shadow: "none",
  },
  text: {
    color: ink,
    hoverColor: ink,
    mutedColor: inkSubtle,
    hoverMutedColor: inkMuted,
  },
  content: {
    background: surface1,
    hoverBackground: surface2,
    borderColor: hairline,
    color: ink,
    hoverColor: ink,
  },
  overlay: {
    select: {
      background: surface3,
      borderColor: hairlineStrong,
      color: ink,
    },
    popover: {
      background: surface3,
      borderColor: hairlineStrong,
      color: ink,
    },
    modal: {
      background: surface2,
      borderColor: hairlineStrong,
      color: ink,
    },
  },
  list: {
    option: {
      focusBackground: surface2,
      selectedBackground: "color-mix(in srgb, #5e6ad2 22%, #14161c)",
      selectedFocusBackground: "color-mix(in srgb, #5e6ad2 30%, #14161c)",
      color: inkMuted,
      focusColor: ink,
      selectedColor: ink,
      selectedFocusColor: ink,
    },
    optionGroup: {
      background: surface1,
      color: inkSubtle,
    },
  },
  navigation: {
    item: {
      focusBackground: surface2,
      activeBackground: surface3,
      color: inkSubtle,
      focusColor: ink,
      activeColor: ink,
    },
    submenuLabel: {
      background: surface1,
      color: inkSubtle,
    },
    submenuIcon: {
      color: inkSubtle,
      focusColor: ink,
      activeColor: ink,
    },
  },
}

export const reviewInboxTheme = definePreset(Aura, {
  primitive: {
    borderRadius: {
      xs: "4px",
      sm: "6px",
      md: "8px",
      lg: "12px",
      xl: "16px",
    },
  },
  semantic: {
    transitionDuration: "150ms",
    primary: {
      50: "#f0f1ff",
      100: "#dfe2ff",
      200: "#c4c9ff",
      300: "#a6afff",
      400: primaryHover,
      500: primary,
      600: primaryFocus,
      700: "#4b55b8",
      800: "#3d4697",
      900: "#303674",
      950: "#20244d",
    },
    focusRing: {
      width: "2px",
      style: "solid",
      color: "color-mix(in srgb, #5e69d1 50%, transparent)",
      offset: "2px",
      shadow: "none",
    },
    formField: {
      paddingX: "12px",
      paddingY: "8px",
      borderRadius: "8px",
      focusRing: {
        width: "2px",
        style: "solid",
        color: "color-mix(in srgb, #5e69d1 50%, transparent)",
        offset: "0",
        shadow: "none",
      },
    },
    content: {
      borderRadius: "12px",
    },
    overlay: {
      select: {
        borderRadius: "12px",
        shadow: "none",
      },
      popover: {
        borderRadius: "12px",
        shadow: "none",
      },
      modal: {
        borderRadius: "16px",
        shadow: "none",
      },
      navigation: {
        shadow: "none",
      },
    },
    colorScheme: {
      light: linearColorScheme,
      dark: linearColorScheme,
    },
  },
  components: {
    button: {
      root: {
        borderRadius: "8px",
        roundedBorderRadius: "9999px",
        paddingX: "14px",
        paddingY: "8px",
        label: {
          fontWeight: "500",
        },
        raisedShadow: "none",
        primary: {
          background: primary,
          hoverBackground: primaryHover,
          activeBackground: primaryFocus,
          borderColor: primary,
          hoverBorderColor: primaryHover,
          activeBorderColor: primaryFocus,
          color: "#ffffff",
          hoverColor: "#ffffff",
          activeColor: "#ffffff",
          focusRing: {
            color: "color-mix(in srgb, #5e69d1 50%, transparent)",
            shadow: "none",
          },
        },
        secondary: {
          background: surface1,
          hoverBackground: surface2,
          activeBackground: surface3,
          borderColor: hairline,
          hoverBorderColor: hairlineStrong,
          activeBorderColor: hairlineStrong,
          color: ink,
          hoverColor: ink,
          activeColor: ink,
        },
      },
    },
    card: {
      root: {
        background: surface1,
        color: ink,
        borderRadius: "12px",
        shadow: "none",
      },
      body: {
        padding: "24px",
      },
    },
  },
})
