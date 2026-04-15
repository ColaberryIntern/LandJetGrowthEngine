'use client';

import { createContext, useContext } from 'react';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  es: 'Espanol',
  fr: 'Francais',
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    'nav.outreach': 'Outreach',
    'nav.campaigns': 'Campaigns',
    'nav.activity': 'Activity',
    'nav.integrations': 'Integrations',
    'nav.qa': 'QA',
    'nav.performance': 'Perf',
    'nav.system': 'System',
    'nav.jobs': 'Jobs',
    'common.loading': 'Loading...',
    'common.refresh': 'Refresh',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.status': 'Status',
    'common.actions': 'Actions',
    'common.date': 'Date',
    'common.name': 'Name',
    'common.type': 'Type',
    'system.title': 'System Reliability & Performance',
    'system.subtitle': 'Monitor system health, agents, and infrastructure status',
    'system.locale': 'Locale & Formatting',
    'system.resources': 'Resource Allocation',
    'system.agents': 'AI Agents',
    'system.infrastructure': 'Infrastructure',
    'system.language': 'Language',
    'jobs.title': 'Job Management',
    'jobs.subtitle': 'Background jobs, scheduled agents, and system configuration',
    'outreach.title': 'Daily Outreach',
    'campaigns.title': 'Campaigns',
  },
  es: {
    'nav.outreach': 'Difusion',
    'nav.campaigns': 'Campanas',
    'nav.activity': 'Actividad',
    'nav.integrations': 'Integraciones',
    'nav.qa': 'QA',
    'nav.performance': 'Rend.',
    'nav.system': 'Sistema',
    'nav.jobs': 'Tareas',
    'common.loading': 'Cargando...',
    'common.refresh': 'Actualizar',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.edit': 'Editar',
    'common.delete': 'Eliminar',
    'common.search': 'Buscar',
    'common.filter': 'Filtrar',
    'common.status': 'Estado',
    'common.actions': 'Acciones',
    'common.date': 'Fecha',
    'common.name': 'Nombre',
    'common.type': 'Tipo',
    'system.title': 'Fiabilidad y Rendimiento del Sistema',
    'system.subtitle': 'Supervisar la salud del sistema, los agentes y la infraestructura',
    'system.locale': 'Configuracion Regional',
    'system.resources': 'Asignacion de Recursos',
    'system.agents': 'Agentes de IA',
    'system.infrastructure': 'Infraestructura',
    'system.language': 'Idioma',
    'jobs.title': 'Gestion de Tareas',
    'jobs.subtitle': 'Tareas en segundo plano, agentes programados y configuracion del sistema',
    'outreach.title': 'Difusion Diaria',
    'campaigns.title': 'Campanas',
  },
  fr: {
    'nav.outreach': 'Prospection',
    'nav.campaigns': 'Campagnes',
    'nav.activity': 'Activite',
    'nav.integrations': 'Integrations',
    'nav.qa': 'QA',
    'nav.performance': 'Perf.',
    'nav.system': 'Systeme',
    'nav.jobs': 'Taches',
    'common.loading': 'Chargement...',
    'common.refresh': 'Actualiser',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.edit': 'Modifier',
    'common.delete': 'Supprimer',
    'common.search': 'Rechercher',
    'common.filter': 'Filtrer',
    'common.status': 'Statut',
    'common.actions': 'Actions',
    'common.date': 'Date',
    'common.name': 'Nom',
    'common.type': 'Type',
    'system.title': 'Fiabilite et Performance du Systeme',
    'system.subtitle': 'Surveiller la sante du systeme, les agents et l\'infrastructure',
    'system.locale': 'Parametres Regionaux',
    'system.resources': 'Allocation des Ressources',
    'system.agents': 'Agents IA',
    'system.infrastructure': 'Infrastructure',
    'system.language': 'Langue',
    'jobs.title': 'Gestion des Taches',
    'jobs.subtitle': 'Taches en arriere-plan, agents programmes et configuration systeme',
    'outreach.title': 'Prospection Quotidienne',
    'campaigns.title': 'Campagnes',
  },
};

export function t(key: string, lang: Language = 'en'): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

export interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

export const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => t(key, 'en'),
});

export function useTranslation() {
  return useContext(I18nContext);
}
