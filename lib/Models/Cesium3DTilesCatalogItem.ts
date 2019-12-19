import { computed, observable, runInAction, toJS } from "mobx";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import clone from "terriajs-cesium/Source/Core/clone";
import IonResource from "terriajs-cesium/Source/Core/IonResource";
import Resource from "terriajs-cesium/Source/Core/Resource";
import Cesium3DTileFeature from "terriajs-cesium/Source/Scene/Cesium3DTileFeature";
import Cesium3DTileset from "terriajs-cesium/Source/Scene/Cesium3DTileset";
import Cesium3DTileStyle from "terriajs-cesium/Source/Scene/Cesium3DTileStyle";
import ShadowMode from "terriajs-cesium/Source/Scene/ShadowMode";
import isDefined from "../Core/isDefined";
import makeRealPromise from "../Core/makeRealPromise";
import runLater from "../Core/runLater";
import AsyncMappableMixin from "../ModelMixins/AsyncMappableMixin";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import FeatureInfoMixin from "../ModelMixins/FeatureInfoMixin";
import Cesium3DTilesCatalogItemTraits, {
  OptionsTraits
} from "../Traits/Cesium3DCatalogItemTraits";
import CommonStrata from "./CommonStrata";
import CreateModel from "./CreateModel";
import createStratumInstance from "./createStratumInstance";
import Feature from "./Feature";
import Mappable from "./Mappable";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import raiseErrorToUser from "./raiseErrorToUser";
import i18next from "i18next";

class ObservableCesium3DTileset extends Cesium3DTileset {
  _catalogItem?: Cesium3DTilesCatalogItem;
  @observable destroyed = false;

  destroy() {
    super.destroy();
    // TODO: we are running later to prevent this
    // modification from happening in some computed up the call chain.
    // Figure out why that is happening and fix it.
    runLater(() => {
      runInAction(() => {
        this.destroyed = true;
      });
    });
  }
}

export default class Cesium3DTilesCatalogItem
  extends FeatureInfoMixin(
    AsyncMappableMixin(
      CatalogMemberMixin(CreateModel(Cesium3DTilesCatalogItemTraits))
    )
  )
  implements Mappable {
  static readonly type = "3d-tiles";
  readonly type = Cesium3DTilesCatalogItem.type;
  get typeName() {
    return i18next.t("models.cesiumTerrain.name");
  }

  readonly canZoomTo = true;
  readonly showsInfo = true;

  private tileset?: ObservableCesium3DTileset;

  get isMappable() {
    return true;
  }

  protected forceLoadMetadata() {
    return Promise.resolve();
  }

  protected forceLoadMapItems() {
    this.loadTileset();
    if (this.tileset) {
      return makeRealPromise<Cesium3DTileset>(this.tileset.readyPromise).then(
        tileset => {
          if (tileset.extras.style) {
            runInAction(() => {
              this.strata.set(
                CommonStrata.defaults,
                createStratumInstance(Cesium3DTilesCatalogItemTraits, {
                  style: tileset.extras.style
                })
              );
            });
          }
        }
      );
    } else {
      return Promise.resolve();
    }
  }

  private loadTileset() {
    if (!isDefined(this.url)) {
      return;
    }

    const tileset = this.createNewTileset(
      proxyCatalogItemUrl(this, this.url),
      this.ionAssetId,
      this.ionAccessToken,
      this.ionServer,
      this.optionsObj
    );

    if (isDefined(tileset) && !tileset.destroyed) {
      this.tileset = tileset;
    }
  }

  @computed get mapItems() {
    if (this.isLoadingMapItems || !isDefined(this.tileset)) {
      return [];
    }

    if (this.tileset.destroyed) {
      this.loadTileset();
    }

    this.tileset.style = toJS(this.cesiumTileStyle);
    this.tileset.shadows = this.cesiumShadows;
    this.tileset.show = this.show;

    // default is 16 (baseMaximumScreenSpaceError @ 2)
    // we want to reduce to 8 for higher levels of quality
    // the slider goes from [quality] 1 to 3 [performance]
    // in 0.1 steps
    const tilesetBaseSse =
      this.options.maximumScreenSpaceError !== undefined
        ? this.options.maximumScreenSpaceError / 2.0
        : 8;
    this.tileset.maximumScreenSpaceError =
      tilesetBaseSse * this.terria.baseMaximumScreenSpaceError;

    return [this.tileset];
  }

  @computed get optionsObj() {
    const options: any = {};
    if (isDefined(this.options)) {
      Object.keys(OptionsTraits.traits).forEach(name => {
        options[name] = (<any>this.options)[name];
      });
    }
    return options;
  }

  private createNewTileset(
    url: Resource | string,
    ionAssetId: number | undefined,
    ionAccessToken: string | undefined,
    ionServer: string | undefined,
    options: any
  ) {
    if (!isDefined(url) && !isDefined(ionAssetId)) {
      return;
    }

    let resource: Promise<IonResource> | Resource | undefined;
    if (isDefined(ionAssetId)) {
      resource = <Promise<IonResource>>makeRealPromise(
        IonResource.fromAssetId(ionAssetId, {
          accessToken:
            ionAccessToken || this.terria.configParameters.cesiumIonAccessToken,
          server: ionServer
        })
      ).catch(e => {
        raiseErrorToUser(this.terria, e);
      });
    } else if (isDefined(url)) {
      if (url instanceof Resource) {
        resource = url;
      } else {
        resource = new Resource({ url });
      }
    }

    if (!isDefined(resource)) {
      return;
    }

    const tileset = new ObservableCesium3DTileset({
      ...options,
      url: resource
    });

    tileset._catalogItem = this;
    return tileset;
  }

  @computed get showExpressionFromFilters() {
    if (!isDefined(this.filters)) {
      return;
    }
    const terms = this.filters.map(filter => {
      if (!isDefined(filter.property)) {
        return "";
      }

      const property =
        "${feature['" + filter.property.replace(/'/g, "\\'") + "']}";
      const min =
        isDefined(filter.minimumValue) &&
        isDefined(filter.minimumShown) &&
        filter.minimumShown > filter.minimumValue
          ? property + " >= " + filter.minimumShown
          : "";
      const max =
        isDefined(filter.maximumValue) &&
        isDefined(filter.maximumShown) &&
        filter.maximumShown < filter.maximumValue
          ? property + " <= " + filter.maximumShown
          : "";
      return [min, max].filter(x => x.length > 0).join(" && ");
    });

    const showExpression = terms.join("&&");
    if (showExpression.length > 0) {
      return showExpression;
    }
  }

  @computed get cesiumTileStyle() {
    if (!isDefined(this.style) && !isDefined(this.showExpressionFromFilters)) {
      return;
    }
    const style = clone(toJS(this.style) || {});
    if (isDefined(this.showExpressionFromFilters)) {
      style.show = toJS(this.showExpressionFromFilters);
    }
    return new Cesium3DTileStyle(style);
  }

  @computed get cesiumShadows() {
    switch (this.shadows.toLowerCase()) {
      case "none":
        return ShadowMode.DISABLED;
      case "both":
        return ShadowMode.ENABLED;
      case "cast":
        return ShadowMode.CAST_ONLY;
      case "receive":
        return ShadowMode.RECEIVE_ONLY;
      default:
        return ShadowMode.DISABLED;
    }
  }

  buildFeatureFromPickResult(_screenPosition: Cartesian2, pickResult: any) {
    if (pickResult instanceof Cesium3DTileFeature) {
      const properties: { [name: string]: unknown } = {};
      pickResult.getPropertyNames().forEach(name => {
        properties[name] = pickResult.getProperty(name);
      });

      const result = new Feature({
        properties
      });

      result._cesium3DTileFeature = pickResult;
      return result;
    }
  }
}
