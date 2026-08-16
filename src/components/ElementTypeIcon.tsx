import type { SvgIconComponent } from "@mui/icons-material";
import type { SvgIconProps } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import GroupsIcon from "@mui/icons-material/Groups";
import PublicIcon from "@mui/icons-material/Public";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import CastleIcon from "@mui/icons-material/Castle";
import CottageIcon from "@mui/icons-material/Cottage";
import MapIcon from "@mui/icons-material/Map";
import EventIcon from "@mui/icons-material/Event";
import HistoryIcon from "@mui/icons-material/History";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import StarIcon from "@mui/icons-material/Star";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import BoltIcon from "@mui/icons-material/Bolt";
import ShieldIcon from "@mui/icons-material/Shield";
import GavelIcon from "@mui/icons-material/Gavel";
import DiamondIcon from "@mui/icons-material/Diamond";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PetsIcon from "@mui/icons-material/Pets";
import TerrainIcon from "@mui/icons-material/Terrain";
import FlagIcon from "@mui/icons-material/Flag";
import LanguageIcon from "@mui/icons-material/Language";
import CategoryIcon from "@mui/icons-material/Category";

export const elementTypeIconOptions: { key: string; label: string; Icon: SvgIconComponent }[] = [
  { key: "Person", label: "Person", Icon: PersonIcon },
  { key: "Groups", label: "Group", Icon: GroupsIcon },
  { key: "Public", label: "World", Icon: PublicIcon },
  { key: "LocationOn", label: "Place", Icon: LocationOnIcon },
  { key: "Castle", label: "Castle", Icon: CastleIcon },
  { key: "Cottage", label: "Cottage", Icon: CottageIcon },
  { key: "Map", label: "Map", Icon: MapIcon },
  { key: "Event", label: "Event", Icon: EventIcon },
  { key: "History", label: "History", Icon: HistoryIcon },
  { key: "AutoStories", label: "Story", Icon: AutoStoriesIcon },
  { key: "MenuBook", label: "Lore", Icon: MenuBookIcon },
  { key: "Star", label: "Theme", Icon: StarIcon },
  { key: "AutoAwesome", label: "Magic", Icon: AutoAwesomeIcon },
  { key: "LocalFireDepartment", label: "Conflict", Icon: LocalFireDepartmentIcon },
  { key: "Bolt", label: "Power", Icon: BoltIcon },
  { key: "Shield", label: "Faction", Icon: ShieldIcon },
  { key: "Gavel", label: "Law", Icon: GavelIcon },
  { key: "Diamond", label: "Treasure", Icon: DiamondIcon },
  { key: "Inventory2", label: "Object", Icon: Inventory2Icon },
  { key: "Pets", label: "Creature", Icon: PetsIcon },
  { key: "Terrain", label: "Terrain", Icon: TerrainIcon },
  { key: "Flag", label: "Nation", Icon: FlagIcon },
  { key: "Language", label: "Culture", Icon: LanguageIcon },
];

const iconsByKey = new Map(elementTypeIconOptions.map((option) => [option.key, option.Icon]));

export const defaultElementTypeIcon: SvgIconComponent = CategoryIcon;

export function ElementTypeIcon({ icon, ...props }: { icon?: string } & SvgIconProps) {
  const Icon = (icon && iconsByKey.get(icon)) || defaultElementTypeIcon;
  return <Icon {...props} />;
}
