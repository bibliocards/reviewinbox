import { definePreset } from "@primeuix/themes"
import Aura from "@primeuix/themes/aura"

const darkCanvas = "#010102"
const darkSurface1 = "#0d0e12"
const darkSurface2 = "#14161c"
const darkSurface3 = "#1a1d24"
const darkSurface4 = "#20242d"
const darkHairline = "#23252a"
const darkHairlineStrong = "#343844"
const darkInk = "#f7f8f8"
const darkInkMuted = "#d0d6e0"
const darkInkSubtle = "#8a8f98"
const lightCanvas = "#f7f7f2"
const lightSurface1 = "#ffffff"
const lightSurface2 = "#f0f1f6"
const lightSurface3 = "#e6e8f0"
const lightSurface4 = "#d9dce8"
const lightHairline = "#d9dce8"
const lightHairlineStrong = "#b8bdcc"
const lightInk = "#17181c"
const lightInkMuted = "#4b5160"
const lightInkSubtle = "#6f7686"
const primary = "#5e6ad2"
const primaryHover = "#828fff"
const primaryFocus = "#5e69d1"

const darkSurfacePalette = {
  0: "#ffffff",
  50: "#f7f8f8",
  100: "#d0d6e0",
  200: "#b4bbc7",
  300: "#8a8f98",
  400: "#62666d",
  500: "#343844",
  600: darkHairline,
  700: darkSurface4,
  800: darkSurface3,
  900: darkSurface2,
  950: darkCanvas,
}

const lightSurfacePalette = {
  0: "#ffffff",
  50: lightCanvas,
  100: lightSurface2,
  200: lightSurface3,
  300: lightSurface4,
  400: lightHairlineStrong,
  500: "#8e95a6",
  600: "#6f7686",
  700: lightInkMuted,
  800: "#303440",
  900: lightInk,
  950: "#0f1117",
}

const darkColorScheme = {
  surface: darkSurfacePalette,
  primary: {
    color: primary,
    contrastColor: "#ffffff",
    hoverColor: primaryHover,
    activeColor: primaryFocus,
  },
  highlight: {
    background: "color-mix(in srgb, #5e6ad2 22%, transparent)",
    focusBackground: "color-mix(in srgb, #5e6ad2 28%, transparent)",
    color: darkInk,
    focusColor: darkInk,
  },
  mask: {
    background: "rgba(0, 0, 0, 0.72)",
    color: darkInk,
  },
  formField: {
    background: darkSurface1,
    disabledBackground: darkSurface2,
    filledBackground: darkSurface1,
    filledHoverBackground: darkSurface2,
    filledFocusBackground: darkSurface1,
    borderColor: darkHairline,
    hoverBorderColor: darkHairlineStrong,
    focusBorderColor: primaryFocus,
    color: darkInk,
    disabledColor: "#62666d",
    placeholderColor: darkInkSubtle,
    floatLabelColor: darkInkSubtle,
    floatLabelFocusColor: primaryHover,
    floatLabelActiveColor: darkInkMuted,
    iconColor: darkInkSubtle,
    shadow: "none",
  },
  text: {
    color: darkInk,
    hoverColor: darkInk,
    mutedColor: darkInkSubtle,
    hoverMutedColor: darkInkMuted,
  },
  content: {
    background: darkSurface1,
    hoverBackground: darkSurface2,
    borderColor: darkHairline,
    color: darkInk,
    hoverColor: darkInk,
  },
  overlay: {
    select: {
      background: darkSurface3,
      borderColor: darkHairlineStrong,
      color: darkInk,
    },
    popover: {
      background: darkSurface3,
      borderColor: darkHairlineStrong,
      color: darkInk,
    },
    modal: {
      background: darkSurface2,
      borderColor: darkHairlineStrong,
      color: darkInk,
    },
  },
  list: {
    option: {
      focusBackground: darkSurface2,
      selectedBackground: "color-mix(in srgb, #5e6ad2 22%, #14161c)",
      selectedFocusBackground: "color-mix(in srgb, #5e6ad2 30%, #14161c)",
      color: darkInkMuted,
      focusColor: darkInk,
      selectedColor: darkInk,
      selectedFocusColor: darkInk,
    },
    optionGroup: {
      background: darkSurface1,
      color: darkInkSubtle,
    },
  },
  navigation: {
    item: {
      focusBackground: darkSurface2,
      activeBackground: darkSurface3,
      color: darkInkSubtle,
      focusColor: darkInk,
      activeColor: darkInk,
    },
    submenuLabel: {
      background: darkSurface1,
      color: darkInkSubtle,
    },
    submenuIcon: {
      color: darkInkSubtle,
      focusColor: darkInk,
      activeColor: darkInk,
    },
  },
}

const lightColorScheme = {
  surface: lightSurfacePalette,
  primary: {
    color: primary,
    contrastColor: "#ffffff",
    hoverColor: "#4f5bc7",
    activeColor: "#444fb3",
  },
  highlight: {
    background: "color-mix(in srgb, #5e6ad2 12%, #ffffff)",
    focusBackground: "color-mix(in srgb, #5e6ad2 18%, #ffffff)",
    color: lightInk,
    focusColor: lightInk,
  },
  mask: {
    background: "rgba(15, 17, 23, 0.42)",
    color: lightInk,
  },
  formField: {
    background: lightSurface1,
    disabledBackground: lightSurface2,
    filledBackground: lightSurface1,
    filledHoverBackground: lightSurface2,
    filledFocusBackground: lightSurface1,
    borderColor: lightHairline,
    hoverBorderColor: lightHairlineStrong,
    focusBorderColor: primaryFocus,
    color: lightInk,
    disabledColor: "#8e95a6",
    placeholderColor: lightInkSubtle,
    floatLabelColor: lightInkSubtle,
    floatLabelFocusColor: primary,
    floatLabelActiveColor: lightInkMuted,
    iconColor: lightInkSubtle,
    shadow: "none",
  },
  text: {
    color: lightInk,
    hoverColor: lightInk,
    mutedColor: lightInkSubtle,
    hoverMutedColor: lightInkMuted,
  },
  content: {
    background: lightSurface1,
    hoverBackground: lightSurface2,
    borderColor: lightHairline,
    color: lightInk,
    hoverColor: lightInk,
  },
  overlay: {
    select: {
      background: lightSurface1,
      borderColor: lightHairlineStrong,
      color: lightInk,
    },
    popover: {
      background: lightSurface1,
      borderColor: lightHairlineStrong,
      color: lightInk,
    },
    modal: {
      background: lightSurface1,
      borderColor: lightHairlineStrong,
      color: lightInk,
    },
  },
  list: {
    option: {
      focusBackground: lightSurface2,
      selectedBackground: "color-mix(in srgb, #5e6ad2 12%, #ffffff)",
      selectedFocusBackground: "color-mix(in srgb, #5e6ad2 18%, #ffffff)",
      color: lightInkMuted,
      focusColor: lightInk,
      selectedColor: lightInk,
      selectedFocusColor: lightInk,
    },
    optionGroup: {
      background: lightSurface1,
      color: lightInkSubtle,
    },
  },
  navigation: {
    item: {
      focusBackground: lightSurface2,
      activeBackground: lightSurface3,
      color: lightInkSubtle,
      focusColor: lightInk,
      activeColor: lightInk,
    },
    submenuLabel: {
      background: lightSurface1,
      color: lightInkSubtle,
    },
    submenuIcon: {
      color: lightInkSubtle,
      focusColor: lightInk,
      activeColor: lightInk,
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
      light: lightColorScheme,
      dark: darkColorScheme,
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
          background: "{content.background}",
          hoverBackground: "{content.hover.background}",
          activeBackground: "{surface.800}",
          borderColor: "{content.border.color}",
          hoverBorderColor: "{form.field.hover.border.color}",
          activeBorderColor: "{form.field.hover.border.color}",
          color: "{text.color}",
          hoverColor: "{text.hover.color}",
          activeColor: "{text.hover.color}",
        },
      },
    },
    card: {
      root: {
        background: "{content.background}",
        color: "{content.color}",
        borderRadius: "12px",
        shadow: "none",
      },
      body: {
        padding: "24px",
      },
    },
  },
})
