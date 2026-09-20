import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState, type ReactNode } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { cn } from '../../lib/cn';
import { colors } from '../../theme';
import { Text } from './Text';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** ອົງປະກອບຊ້າຍສຸດ (ເຊັ່ນ dial-code +856) — ວາງກ່ອນ icon/ຊ່ອງພິມ. */
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
  containerClassName?: string;
  /** ຮູບແບບແໜ້ນ — box ຕ່ຳລົງ, ຕົວອັກສອນ/label ນ້ອຍລົງ (ໃຊ້ໃນຟອມທີ່ມີຫຼາຍຊ່ອງ). */
  dense?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, icon, leftSlot, rightSlot, className, containerClassName, dense, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={cn(dense ? 'w-full gap-1.5' : 'w-full gap-2', containerClassName)}>
      {label ? (
        <Text variant="label" className={dense ? 'text-[13px] leading-[17px]' : undefined}>
          {label}
        </Text>
      ) : null}

      <View
        className={cn(
          'w-full flex-row items-center gap-2 rounded-xl border bg-card px-3.5',
          multiline ? 'min-h-[92px] py-3' : dense ? 'h-11' : 'h-12',
          error
            ? 'border-destructive'
            : focused
              ? 'border-primary'
              : 'border-input',
        )}
      >
        {leftSlot}
        {icon ? (
          <Ionicons
            name={icon}
            size={dense ? 16 : 18}
            color={focused ? colors.primary : colors.mutedForeground}
          />
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          multiline={multiline}
          className={cn(
            'flex-1 font-lao text-foreground',
            dense ? 'text-sm' : 'text-base',
            multiline && 'h-full',
            className,
          )}
          style={multiline ? { textAlignVertical: 'top' } : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {rightSlot}
      </View>

      {error ? (
        <View className="flex-row items-center gap-1">
          <Ionicons name="alert-circle" size={13} color={colors.destructive} />
          <Text variant="caption" className="text-destructive">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
});
