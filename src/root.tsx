import {Composition, Folder, Still} from 'remotion';
import {CybersecurityIntro} from './scenes/CybersecurityIntro';
import {CyberGrid3D} from './scenes/CyberGrid3D';
import {AudioExplainer} from './audio/AudioExplainer';
import {CoverStill} from './majed/CoverStill';
import type {CoverStillProps} from './majed/CoverStill';
import {MontageReel, calculateMontage} from './majed/MontageReel';
import type {MontageReelProps} from './majed/MontageReel';
import {TextBehindSubject} from './majed/TextBehindSubject';
import type {TextBehindSubjectProps} from './majed/TextBehindSubject';
import {TalkingHeadReel, calculateTalkingHead} from './majed/TalkingHeadReel';
import type {TalkingHeadReelProps} from './majed/TalkingHeadReel';
import {calculateAudioMetadata} from './audio/metadata';
import type {AudioProject} from './audio/types';
import activeAudioProject from '../public/audio-projects/audio-motion-sample/project.json';
import {ProductionVideo, calculateProductionMetadata} from './production/render/ProductionVideo';
import type {ProductionVideoProps} from './production/render/types';
import activeProduction from './data/active-production.json';
import {MoveShowcase} from './majed/MoveShowcase';
import {MoveVideoShowcase} from './majed/MoveVideoShowcase';
import './audio/audio-motion.css';

export const MotionStudioRoot: React.FC = () => (
  <>
    <Folder name="Samples">
      <Composition
        id="CybersecurityIntro"
        component={CybersecurityIntro}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CyberGrid3D"
        component={CyberGrid3D}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
    <Folder name="Production">
      <Composition
        id="ProductionVideo"
        component={ProductionVideo}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={activeProduction as unknown as ProductionVideoProps}
        calculateMetadata={calculateProductionMetadata}
      />
    </Folder>
    <Folder name="Motion-Moves">
      <Composition id="MoveShowcase" component={MoveShowcase} durationInFrames={240} fps={60} width={1080} height={1920} defaultProps={{move: 'caption'}} />
      <Composition id="MoveVideoShowcase" component={MoveVideoShowcase} durationInFrames={240} fps={30} width={1080} height={1920} defaultProps={{src: 'majed/sample.mp4', move: 'pushIn'}} />
    </Folder>
    <Folder name="Majed-Video">
      <Composition id="TalkingHeadReel" component={TalkingHeadReel} durationInFrames={150} fps={30} width={1080} height={1920} defaultProps={{src: '', keep: [{start: 0, end: 5}]} as TalkingHeadReelProps} calculateMetadata={calculateTalkingHead} />
      <Composition id="MontageReel" component={MontageReel} durationInFrames={150} fps={30} width={1080} height={1920} defaultProps={{clips: [], beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]} as MontageReelProps} calculateMetadata={calculateMontage} />
      <Composition id="TextBehindSubject" component={TextBehindSubject} durationInFrames={120} fps={30} width={1080} height={1920} defaultProps={{src: '', matte: '', text: 'HASKA'} as TextBehindSubjectProps} />
      <Still id="CoverReel" component={CoverStill} width={1080} height={1920} defaultProps={{kind: 'reel-cover', title: 'عنوان الغلاف', subtitle: 'عنوان فرعي'} as CoverStillProps} />
      <Still id="CoverYouTube" component={CoverStill} width={1280} height={720} defaultProps={{kind: 'youtube', title: 'Cover title'} as CoverStillProps} />
    </Folder>
    <Folder name="Audio-to-Motion">
      <Composition
        id="AudioExplainerYouTube"
        component={AudioExplainer}
        durationInFrames={30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{project: activeAudioProject as AudioProject, preset: 'youtube'}}
        calculateMetadata={calculateAudioMetadata}
      />
      <Composition
        id="AudioExplainerReel"
        component={AudioExplainer}
        durationInFrames={30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{project: activeAudioProject as AudioProject, preset: 'reel'}}
        calculateMetadata={calculateAudioMetadata}
      />
      <Composition
        id="AudioExplainerTikTok"
        component={AudioExplainer}
        durationInFrames={30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{project: activeAudioProject as AudioProject, preset: 'tiktok'}}
        calculateMetadata={calculateAudioMetadata}
      />
    </Folder>
  </>
);
