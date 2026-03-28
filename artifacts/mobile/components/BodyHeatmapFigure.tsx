import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HeatmapSide } from '@/constants/heatmap';

type HighlighterSlug =
  | 'hair'
  | 'hands'
  | 'feet'
  | 'neck'
  | 'ankles'
  | 'knees'
  | 'head'
  | 'deltoids'
  | 'chest'
  | 'abs'
  | 'obliques'
  | 'biceps'
  | 'forearm'
  | 'quadriceps'
  | 'calves'
  | 'trapezius'
  | 'upper-back'
  | 'lower-back'
  | 'triceps'
  | 'gluteal'
  | 'hamstring';

type ExtendedBodyPart = {
  slug?: HighlighterSlug;
  color?: string;
  styles?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };
};

type BodyProps = {
  data: ReadonlyArray<ExtendedBodyPart>;
  scale?: number;
  side?: 'front' | 'back';
  gender?: 'male' | 'female';
  border?: string | 'none';
  defaultFill?: string;
  defaultStroke?: string;
  defaultStrokeWidth?: number;
};

const Body = require('../vendor/react-native-body-highlighter/index.js').default as React.ComponentType<BodyProps>;

type SegmentId =
  | 'front_delts'
  | 'lateral_delts'
  | 'upper_chest'
  | 'abs'
  | 'obliques'
  | 'biceps'
  | 'brachioradialis'
  | 'quads'
  | 'calves'
  | 'rear_delts'
  | 'lats'
  | 'mid_back'
  | 'traps'
  | 'triceps_long_head'
  | 'glutes'
  | 'hamstrings'
  | 'forearms';

const NEUTRAL_FILL = '#e9edf2';
const DARK_FILL = '#2f3238';
const SKIN_FILL = '#d0d3d8';
const STROKE = '#ffffff';
const STROKE_WIDTH = 2;
const SCALE = 1.28;

function partFill(fill: string): ExtendedBodyPart {
  return {
    styles: {
      fill,
      stroke: STROKE,
      strokeWidth: STROKE_WIDTH,
    },
  };
}

function buildBaseParts(): ExtendedBodyPart[] {
  return [
    { slug: 'hair', ...partFill(DARK_FILL) },
    { slug: 'hands', ...partFill(DARK_FILL) },
    { slug: 'feet', ...partFill(DARK_FILL) },
    { slug: 'neck', ...partFill(DARK_FILL) },
    { slug: 'ankles', ...partFill(DARK_FILL) },
    { slug: 'knees', ...partFill(DARK_FILL) },
    { slug: 'head', ...partFill(SKIN_FILL) },
  ];
}

function buildFrontParts(colors: Partial<Record<SegmentId, string>>): ExtendedBodyPart[] {
  return [
    { slug: 'deltoids', color: colors.front_delts ?? colors.lateral_delts },
    { slug: 'chest', color: colors.upper_chest },
    { slug: 'abs', color: colors.abs },
    { slug: 'obliques', color: colors.obliques ?? colors.abs },
    { slug: 'biceps', color: colors.biceps },
    { slug: 'forearm', color: colors.brachioradialis ?? colors.forearms },
    { slug: 'quadriceps', color: colors.quads },
    { slug: 'calves', color: colors.calves },
  ];
}

function buildBackParts(colors: Partial<Record<SegmentId, string>>): ExtendedBodyPart[] {
  const backUpper = colors.traps ?? colors.mid_back ?? colors.lats;
  const backLower = colors.lats ?? colors.mid_back;

  return [
    { slug: 'deltoids', color: colors.rear_delts ?? colors.lats },
    { slug: 'trapezius', color: backUpper },
    { slug: 'upper-back', color: backUpper },
    { slug: 'lower-back', color: backLower },
    { slug: 'triceps', color: colors.triceps_long_head },
    { slug: 'forearm', color: colors.forearms },
    { slug: 'gluteal', color: colors.glutes },
    { slug: 'hamstring', color: colors.hamstrings },
    { slug: 'calves', color: colors.calves },
  ];
}

export function BodyHeatmapFigure({
  side,
  colors,
}: {
  side: HeatmapSide;
  colors: Partial<Record<SegmentId, string>>;
}) {
  const data = useMemo(() => {
    const baseParts = buildBaseParts();
    return side === 'front'
      ? [...baseParts, ...buildFrontParts(colors)]
      : [...baseParts, ...buildBackParts(colors)];
  }, [colors, side]);

  return (
    <View style={styles.frame}>
      <Body
        data={data}
        gender="male"
        side={side}
        scale={SCALE}
        border="none"
        defaultFill={NEUTRAL_FILL}
        defaultStroke={STROKE}
        defaultStrokeWidth={STROKE_WIDTH}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 260,
    alignItems: 'center',
    alignSelf: 'center',
  },
});
