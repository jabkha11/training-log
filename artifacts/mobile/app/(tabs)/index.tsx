import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { DAYS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';
import { formatLocalDateKey, getStartOfLocalWeek } from '@/lib/date';

function getWeekDates() {
  const monday = getStartOfLocalWeek();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getTodayDayId() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { completedWorkouts, isDeloadWeek, setIsDeloadWeek } = useWorkout();
  const todayId = getTodayDayId();
  const weekDates = useMemo(() => getWeekDates(), []);

  const todayIdx = DAYS.findIndex(d => d.id === todayId);
  const orderedDays = [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)];

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>TRAINING LOG</Text>
          <Text style={styles.subtitle}>Progressive Overload Tracker</Text>
        </View>
        <TouchableOpacity
          style={[styles.deloadBtn, isDeloadWeek && styles.deloadBtnActive]}
          onPress={() => setIsDeloadWeek(!isDeloadWeek)}
        >
          <Feather
            name="battery-charging"
            size={14}
            color={isDeloadWeek ? '#000' : Colors.text2}
          />
          <Text style={[styles.deloadBtnText, isDeloadWeek && styles.deloadBtnTextActive]}>
            Deload
          </Text>
        </TouchableOpacity>
      </View>

      {/* Week Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.weekStripScroll}
        contentContainerStyle={styles.weekStripContent}
      >
        {DAYS.map((day, i) => {
          const dateKey = formatLocalDateKey(weekDates[i]);
          const isToday = day.id === todayId;
          const isDone = !!completedWorkouts[dateKey];
          const label = day.rest ? 'REST' : day.session.split(' ')[0];

          return (
            <TouchableOpacity
              key={day.id}
              style={[styles.weekDay, isToday && styles.weekDayToday]}
              onPress={() => !day.rest && router.push({ pathname: '/workout/[dayId]', params: { dayId: day.id } })}
              disabled={!!day.rest}
            >
              <Text style={styles.weekDayName}>{day.label}</Text>
              <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelActive]}>{label}</Text>
              {isDone && <View style={styles.doneDot} />}
              {isToday && <View style={styles.todayUnderline} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Day Cards */}
      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={[styles.cardsContent, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {isDeloadWeek && (
          <View style={styles.deloadBanner}>
            <Feather name="battery-charging" size={16} color={Colors.orange} />
            <Text style={styles.deloadBannerText}>
              Deload Week — Use 50-60% of normal weight, same reps
            </Text>
          </View>
        )}

        {orderedDays.map((day) => {
          const dayIdx = DAYS.findIndex(d => d.id === day.id);
          const dateKey = formatLocalDateKey(weekDates[dayIdx]);
          const isDone = !!completedWorkouts[dateKey];
          const isToday = day.id === todayId;

          return (
            <TouchableOpacity
              key={day.id}
              style={[styles.dayCard, day.rest && styles.dayCardRest, isDone && styles.dayCardDone]}
              onPress={() => !day.rest && router.push({ pathname: '/workout/[dayId]', params: { dayId: day.id } })}
              disabled={!!day.rest}
              activeOpacity={day.rest ? 1 : 0.8}
            >
              <View style={[styles.cardAccent, { backgroundColor: day.color }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTag}>
                  {isToday ? '⚡ Today' : day.name}
                </Text>
                <Text style={[styles.cardTitle, isDone && styles.cardTitleDone]}>
                  {day.session}
                  {isDeloadWeek && !day.rest && (
                    <Text style={styles.deloadTag}> · DELOAD</Text>
                  )}
                </Text>
                <View style={styles.cardMeta}>
                  <Text style={[styles.cardMetaTag, { color: day.color }]}>{day.tag}</Text>
                  {day.exercises && (
                    <Text style={styles.cardMetaCount}>{day.exercises.length} exercises</Text>
                  )}
                </View>
                {day.exercises && (
                  <View style={styles.chipRow}>
                    {day.exercises.slice(0, 3).map((ex, i) => (
                      <View key={i} style={styles.chip}>
                        <Text style={styles.chipText}>{ex.name.split(' ').slice(0, 2).join(' ')}</Text>
                      </View>
                    ))}
                    {day.exercises.length > 3 && (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>+{day.exercises.length - 3}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
              {isDone && (
                <View style={styles.completedBadge}>
                  <Feather name="check" size={12} color={Colors.green} />
                  <Text style={styles.completedBadgeText}>Done</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  logo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  deloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.surface2,
  },
  deloadBtnActive: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orange,
  },
  deloadBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.text2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deloadBtnTextActive: {
    color: '#000',
  },
  weekStripScroll: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    maxHeight: 72,
  },
  weekStripContent: {
    paddingHorizontal: 4,
  },
  weekDay: {
    width: 60,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  weekDayToday: {
    backgroundColor: Colors.surface2,
  },
  weekDayName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  weekDayLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text2,
    letterSpacing: 1,
  },
  weekDayLabelActive: {
    color: Colors.accent,
  },
  doneDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.green,
    marginTop: 4,
  },
  todayUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 2,
    backgroundColor: Colors.accent,
    borderRadius: 1,
  },
  cardsScroll: {
    flex: 1,
  },
  cardsContent: {
    padding: 16,
    gap: 10,
  },
  deloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 159, 82, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 82, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  deloadBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.orange,
    flex: 1,
  },
  dayCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    minHeight: 90,
  },
  dayCardRest: {
    opacity: 0.45,
  },
  dayCardDone: {},
  cardAccent: {
    width: 3,
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 4,
  },
  cardTag: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
    letterSpacing: 1,
  },
  cardTitleDone: {
    color: Colors.text2,
  },
  deloadTag: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.orange,
    letterSpacing: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  cardMetaTag: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  cardMetaCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  chip: {
    backgroundColor: Colors.surface3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  chipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
  },
  completedBadge: {
    position: 'absolute',
    right: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(76,255,145,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  completedBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.green,
    letterSpacing: 1,
  },
});
