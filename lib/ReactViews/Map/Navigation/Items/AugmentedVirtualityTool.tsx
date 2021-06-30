import i18next, { TFunction } from "i18next";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import {
  useTranslation,
  withTranslation,
  WithTranslation
} from "react-i18next";
import styled from "styled-components";
import AugmentedVirtuality from "../../../../Models/AugmentedVirtuality";
import Terria from "../../../../Models/Terria";
import ViewerMode from "../../../../Models/ViewerMode";
import ViewState from "../../../../ReactViewModels/ViewState";
import MapNavigationItemController from "../../../../ViewModels/MapNavigation/MapNavigationItemController";
import { GLYPHS, Icon } from "../../../../Styled/Icon";
import MapIconButton from "../../../MapIconButton/MapIconButton";
import { Control } from "./MapNavigationItem";

interface IAugmentedVirtuality {
  augmentedVirtuality: AugmentedVirtuality;
}

interface IProps extends IAugmentedVirtuality {
  terria: Terria;
  viewState: ViewState;
  experimentalWarning?: boolean;
}

export const AR_TOOL_ID = "AR_TOOL";

export class AugmentedVirtualityController extends MapNavigationItemController {
  @observable experimentalWarningShown = false;
  constructor(private props: IProps) {
    super();
  }

  @computed
  get active(): boolean {
    return this.props.augmentedVirtuality.active;
  }

  get glyph(): { id: string } {
    return this.active ? GLYPHS.arOn : GLYPHS.arOff;
  }

  get viewerMode(): ViewerMode {
    return ViewerMode.Cesium;
  }

  @action.bound
  handleClick() {
    // Make the AugmentedVirtuality module avaliable elsewhere.
    this.props.terria.augmentedVirtuality = this.props.augmentedVirtuality;
    // feature detect for new ios 13
    // it seems you don't need to ask for both, but who knows, ios 14 / something
    // could change again
    if (
      window.DeviceMotionEvent &&
      // exists on window by now?
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      DeviceMotionEvent.requestPermission()
        .then(permissionState => {
          if (permissionState !== "granted") {
            console.error("couldn't get access for motion events");
          }
        })
        .catch(console.error);
    }
    if (
      window.DeviceOrientationEvent &&
      // exists on window by now?
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState !== "granted") {
            console.error("couldn't get access for orientation events");
          }
        })
        .catch(console.error);
    }
    const { experimentalWarning = true } = this.props;

    if (experimentalWarning !== false && !this.experimentalWarningShown) {
      this.experimentalWarningShown = true;
      this.props.viewState.terria.notificationState.addNotificationToQueue({
        title: i18next.t("AR.title"),
        message: i18next.t("AR.experimentalFeatureMessage"),
        confirmText: i18next.t("AR.confirmText")
      });
    }
    this.props.augmentedVirtuality.toggleEnabled();
  }
}

export class AugmentedVirtualityRealignController extends MapNavigationItemController {
  @observable experimentalWarningShown = false;
  @observable realignHelpShown = false;
  @observable resetRealignHelpShown = false;
  augmentedVirtuality: AugmentedVirtuality;
  constructor(private props: IProps) {
    super();
    this.augmentedVirtuality = props.augmentedVirtuality;
  }

  @computed
  get glyph(): { id: string } {
    return !this.augmentedVirtuality.manualAlignmentSet
      ? GLYPHS.arRealign
      : GLYPHS.arResetAlignment;
  }

  get viewerMode(): ViewerMode {
    return ViewerMode.Cesium;
  }

  @computed
  get visible(): boolean {
    return this.props.augmentedVirtuality.active;
  }

  handleClick(): void {
    if (!this.augmentedVirtuality.manualAlignmentSet) {
      this.handleClickRealign();
    } else if (!this.augmentedVirtuality.manualAlignment) {
      this.handleClickResetRealign();
    }
  }

  @action.bound
  handleClickRealign() {
    if (!this.realignHelpShown) {
      this.realignHelpShown = true;

      this.props.viewState.terria.notificationState.addNotificationToQueue({
        title: i18next.t("AR.manualAlignmentTitle"),
        message: i18next.t("AR.manualAlignmentMessage", {
          img:
            '<img width="100%" src="./build/TerriaJS/images/ar-realign-guide.gif" />'
        }),
        confirmText: i18next.t("AR.confirmText")
      });
    }

    this.augmentedVirtuality.toggleManualAlignment();
  }

  @action.bound
  handleClickResetRealign() {
    if (!this.resetRealignHelpShown) {
      this.resetRealignHelpShown = true;
      this.props.viewState.terria.notificationState.addNotificationToQueue({
        title: i18next.t("AR.resetAlignmentTitle"),
        message: i18next.t("AR.resetAlignmentMessage"),
        confirmText: i18next.t("AR.confirmText")
      });
    }

    this.augmentedVirtuality.resetAlignment();
  }
}

export const AugmentedVirtualityRealign: React.FC<{
  arRealignController: AugmentedVirtualityRealignController;
}> = observer(
  (props: { arRealignController: AugmentedVirtualityRealignController }) => {
    const augmentedVirtuality = props.arRealignController.augmentedVirtuality;
    const realignment = augmentedVirtuality.manualAlignment;
    const { t } = useTranslation();
    return !augmentedVirtuality.manualAlignmentSet ? (
      <StyledMapIconButton
        noExpand
        blink={realignment}
        iconElement={() => <Icon glyph={GLYPHS.arRealign} />}
        title={t("AR.btnRealign")}
        onClick={props.arRealignController.handleClickRealign}
      ></StyledMapIconButton>
    ) : (
      <MapIconButton
        noExpand
        iconElement={() => <Icon glyph={GLYPHS.arResetAlignment} />}
        title={t("AR.btnResetRealign")}
        onClick={props.arRealignController.handleClickResetRealign}
      ></MapIconButton>
    );
  }
);

export class AugmentedVirtualityHoverController extends MapNavigationItemController {
  constructor(private props: IAugmentedVirtuality) {
    super();
  }

  get glyph(): { id: string } {
    const hoverLevel = this.props.augmentedVirtuality.hoverLevel;
    // Note: We use the image of the next level that we will be changing to, not the level the we are currently at.
    switch (hoverLevel) {
      case 0:
        return GLYPHS.arHover0;
      case 1:
        return GLYPHS.arHover1;
      case 2:
        return GLYPHS.arHover2;
      default:
        return GLYPHS.arHover0;
    }
  }

  get viewerMode(): ViewerMode {
    return ViewerMode.Cesium;
  }

  @computed
  get visible(): boolean {
    return this.props.augmentedVirtuality.active;
  }

  handleClick(): void {
    this.props.augmentedVirtuality.toggleHoverHeight();
  }
}

const StyledMapIconButton = styled(MapIconButton)<{ blink: boolean }>`
  svg {
    ${p =>
      p.blink &&
      `
      -webkit-animation-name: blinker;
      -webkit-animation-duration: 1s;
      -webkit-animation-timing-function: linear;
      -webkit-animation-iteration-count: infinite;

      -moz-animation-name: blinker;
      -moz-animation-duration: 1s;
      -moz-animation-timing-function: linear;
      -moz-animation-iteration-count: infinite;

      animation-name: blinker;
      animation-duration: 1s;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    `}
  }

  @-moz-keyframes blinker {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @-webkit-keyframes blinker {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  @keyframes blinker {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
`;