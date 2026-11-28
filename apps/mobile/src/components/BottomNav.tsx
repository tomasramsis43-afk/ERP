import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { useTheme } from '../screens/theme';

export type NavKey = 'today' | 'customers' | 'sale' | 'collection' | 'more';

/**
 * Five-item bottom bar with the sale action raised in the middle. The centre button is the one action a
 * representative uses all day, so it stays reachable with a thumb and never hides inside a menu.
 */
export function BottomNav({ active, onSelect }: { active: NavKey; onSelect: (key: NavKey) => void }) {
  const { c, font } = useTheme();
  const st = StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: c.bg,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 8,
      paddingBottom: 8,
      paddingHorizontal: 6,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 2, minHeight: 52 },
    label: { fontSize: 9, fontFamily: font.bold },
    fabWrap: { flex: 1, alignItems: 'center' },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -30,
      marginBottom: 4,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
      borderWidth: 4,
      borderColor: c.bg,
    },
    fabLabel: { fontSize: 9, fontFamily: font.bold, color: c.primary },
  });

  const item = (key: NavKey, icon: keyof typeof Ionicons.glyphMap, label: string) => {
    const on = active === key;
    return (
      <Pressable
        key={key}
        style={st.item}
        onPress={() => onSelect(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
      >
        <Ionicons name={on ? icon : (`${icon}-outline` as keyof typeof Ionicons.glyphMap)} size={21} color={on ? c.primary : c.sub} />
        <Text style={[st.label, { color: on ? c.primary : c.sub }]} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={st.bar}>
      {item('today', 'home', t('today'))}
      {item('customers', 'people', t('customers'))}
      <View style={st.fabWrap}>
        <Pressable
          style={({ pressed }) => [st.fab, pressed ? { opacity: 0.9 } : null]}
          onPress={() => onSelect('sale')}
          accessibilityRole="button"
          accessibilityLabel={t('newSale')}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
        <Text style={st.fabLabel} numberOfLines={1}>{t('newSale')}</Text>
      </View>
      {item('collection', 'cash', t('collection'))}
      {item('more', 'grid', t('more'))}
    </View>
  );
}
