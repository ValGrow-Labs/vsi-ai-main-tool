"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  useFloating, 
  offset, 
  flip, 
  shift, 
  autoUpdate, 
  useInteractions,
  useDismiss,
  useRole,
  useClick,
  FloatingFocusManager,
  useListNavigation
} from "@floating-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export interface DropdownOption {
  value: string;
  label: string;
  secondaryLabel?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (val: string) => void;
  trigger: React.ReactNode;
  variant?: "default" | "date-range" | "filter";
}

function useDetectedTheme(): boolean {
  const [isDarkState, setIsDarkState] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  let contextTheme: string | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const context = useTheme();
    contextTheme = context?.resolvedTheme || context?.theme;
  } catch {
    // Context unavailable
  }

  useEffect(() => {
    setMounted(true);

    const detectDark = (): boolean => {
      // Priority 1: ThemeProvider / ThemeContext / next-themes
      if (contextTheme) {
        return contextTheme === "dark";
      }
      // Priority 2: Tailwind / HTML class / data-theme attribute
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        if (
          root.classList.contains("dark") ||
          document.body?.classList.contains("dark") ||
          root.getAttribute("data-theme") === "dark"
        ) {
          return true;
        }
        if (
          root.classList.contains("light") ||
          root.getAttribute("data-theme") === "light"
        ) {
          return false;
        }
      }
      // Priority 3: CSS Variables / System dark mode preference
      if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
      return false;
    };

    setIsDarkState(detectDark());

    if (typeof window === "undefined") return;

    // Observe changes to <html> element class / attributes for instant switching
    const observer = new MutationObserver(() => {
      setIsDarkState(detectDark());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      setIsDarkState(detectDark());
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    return () => {
      observer.disconnect();
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, [contextTheme]);

  if (contextTheme) {
    return contextTheme === "dark";
  }

  if (mounted) {
    return isDarkState;
  }

  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark");
  }
  return false;
}

export function Dropdown({ options, value, onChange, trigger, variant = "default" }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isDark = useDetectedTheme();

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(variant === "default" ? 8 : 0),
      flip({ fallbackAxisSideDirection: "end", padding: 16 }),
      shift({ padding: 16 })
    ]
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });

  const listRef = useRef<Array<HTMLElement | null>>([]);
  
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNavigation
  ]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()} className="inline-block cursor-pointer outline-none">
        {trigger}
      </div>
      
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isOpen && (
            <FloatingFocusManager context={context} modal={false}>
              <div
                ref={refs.setFloating}
                style={{
                  ...floatingStyles,
                  zIndex: 9999,
                }}
                {...getFloatingProps()}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: variant === "default" ? 0.15 : 0, ease: "easeOut" }}
                  className="flex flex-col overflow-hidden font-sans"
                  style={{
                    width: variant === "filter" ? "130px" : (variant === "date-range" ? "145px" : "180px"),
                    minWidth: variant === "filter" ? "130px" : (variant === "date-range" ? "145px" : "170px"),
                    maxWidth: variant === "filter" ? "130px" : (variant === "date-range" ? "145px" : "200px"),
                    background: variant === "filter" ? (isDark ? "#1E1E23" : "#FFFFFF") : (variant === "date-range" ? (isDark ? "#1E1E23" : "#FFFFFF") : "#1E1E23"),
                    border: variant === "filter" ? (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #D9D9D9") : (variant === "date-range" ? (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #D9D9D9") : "1px solid rgba(255,255,255,0.06)"),
                    borderRadius: variant === "default" ? "12px" : "0px",
                    boxShadow: variant === "filter" ? (isDark ? "0 10px 30px rgba(0,0,0,.45)" : "0 8px 20px rgba(0,0,0,.12)") : (variant === "default" ? "0 20px 60px rgba(0,0,0,.45)" : (variant === "date-range" ? (isDark ? "0 10px 30px rgba(0,0,0,.45)" : "0 8px 20px rgba(0,0,0,.12)") : "none")),
                    padding: variant === "default" ? "4px" : "0px",
                  }}
                >
                  <div className={`flex flex-col ${variant === "default" ? 'gap-[2px] max-h-[180px]' : 'gap-[0px] h-auto'} overflow-y-auto outline-none custom-scrollbar`}>
                    {options.map((option, index) => {
                      const isSelected = value === option.value;
                      const isActive = activeIndex === index;
                      
                      return (
                        <div
                          key={option.value}
                          ref={(node) => {
                            listRef.current[index] = node;
                          }}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={isActive ? 0 : -1}
                          {...getItemProps({
                            onClick: (e: React.MouseEvent) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSelect(option.value);
                            },
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSelect(option.value);
                              }
                            }
                          })}
                          className={`
                            flex items-center justify-between outline-none cursor-pointer ${variant === "default" ? 'rounded-[8px]' : 'rounded-none'}
                            transition-colors duration-150 shrink-0
                          `}
                          style={{
                            height: variant === "filter" ? "30px" : (variant === "date-range" ? "30px" : "34px"),
                            padding: variant === "filter" ? "4px 8px" : (variant === "default" ? "0 12px" : "4px 8px"),
                            backgroundColor: isSelected 
                              ? (variant === "filter" ? (isDark ? "#FF6B00" : "#4F8EF7") : (variant === "date-range" ? (isDark ? "#FF6B00" : "#4F8EF7") : "#FF6B00")) 
                              : (isActive ? (variant === "filter" ? (isDark ? "#2B2B32" : "#F5F5F5") : (variant === "date-range" ? (isDark ? "#2B2B32" : "#F5F5F5") : "#2B2B32")) : "transparent"),
                            color: isSelected 
                              ? "#FFFFFF" 
                              : (variant === "filter" ? (isDark ? "#FFFFFF" : "#1F1F1F") : (variant === "date-range" ? (isDark ? "#FFFFFF" : "#222222") : "#FFFFFF")),
                            borderBottom: variant === "filter" && index < options.length - 1 
                              ? (isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #EEEEEE") 
                              : "none",
                            boxSizing: "border-box"
                          }}
                        >
                          <div className="flex flex-col">
                            <span className={`${variant === "default" ? 'text-[13px]' : 'text-[12px]'} font-medium`} style={{ color: "inherit" }}>
                              {option.label}
                            </span>
                            {option.secondaryLabel && (
                              <span className={`text-[11px] mt-0.5 ${isSelected ? "text-white/80" : "text-[#9CA3AF]"}`}>
                                {option.secondaryLabel}
                              </span>
                            )}
                          </div>
                          {variant === "default" && isSelected && <Check size={16} className="text-white shrink-0 ml-2" />}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            </FloatingFocusManager>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

