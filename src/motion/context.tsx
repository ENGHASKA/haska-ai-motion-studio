import {createContext, useContext, useMemo} from 'react';
import {useVideoConfig} from 'remotion';
import type {PlatformId, PlatformParams, StyleProfile} from '../production/style-profile';
import {HASKA_CYBER} from '../production/style-profile';
import {platformForSize, resolvePlatform, safeBox} from './style';
import type {SafeBox} from './style';

type Value = {style: StyleProfile; platformId?: PlatformId; language?: string};

const ProductionContext = createContext<Value | null>(null);

/** Supplies the Style Profile (and optionally an explicit platform) to every motion component below it. */
export const ProductionProvider: React.FC<Value & {children: React.ReactNode}> = ({style, platformId, language, children}) => {
  const value = useMemo(() => ({style, platformId, language}), [style, platformId, language]);
  return <ProductionContext.Provider value={value}>{children}</ProductionContext.Provider>;
};

export type ProductionEnvironment = {
  style: StyleProfile;
  platform: PlatformParams;
  box: SafeBox;
  fps: number;
  width: number;
  height: number;
  /** Language of the video (e.g. "ar"); decides paragraph direction for mixed text. */
  language?: string;
};

/** Style Profile + platform parameters for the current composition. Falls back to haska-cyber outside a provider. */
export const useProduction = (): ProductionEnvironment => {
  const context = useContext(ProductionContext);
  const {width, height, fps} = useVideoConfig();
  const style = context?.style ?? HASKA_CYBER;
  const id = context?.platformId ?? platformForSize(width, height);
  return useMemo(() => {
    const platform = resolvePlatform(style, id, width, height);
    return {style, platform, box: safeBox(platform, width, height), fps, width, height, language: context?.language};
  }, [style, id, width, height, fps, context?.language]);
};
