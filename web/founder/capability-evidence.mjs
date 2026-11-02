const labels={
 revoked:'widerrufen',present:'vorhanden',missing:'fehlt',unknown:'unbekannt',confirmed:'bestätigt',denied:'verweigert',
 'observed-available':'Verfügbarkeit belegt',unavailable:'nicht verfügbar',stale:'veraltet',
 passed:'bestanden',failed:'fehlgeschlagen','observed-success':'Erfolg belegt','observed-failure':'Fehlschlag belegt'
};
export function capabilityCertificateText(c){
 const status={passed:'bestanden',failed:'fehlgeschlagen',invalidated:'Code während der Prüfung geändert'}[c?.status]??'unbekannt';
 const currency={current:'Lokaler Quellstand stimmt mit dem Zertifikat überein; laufender Code nicht bestätigt',stale:'Lokaler Quellstand geändert; Zertifikat veraltet','not-passed':'Kein gültiger erfolgreicher Testlauf'}[c?.currency]??'aktueller Code nicht erneut geprüft';
 return 'Offline-Testzertifikat: '+status+' · '+(Number.isSafeInteger(c?.tests)?c.tests:0)+' Tests · '+currency+' · keine Quellenfreigabe und kein Live-Nachweis.';
}
export function qualityBindingText(b){
 const status={'profile-tested':'Fachprofil offline geprüft',stale:'Revision veraltet',revoked:'Nachweis widerrufen','revision-unverified':'Aktuelle Revision ungeprüft','source-binding-unverified':'Quellbindung ungeprüft','profile-not-supported':'Fachprofil vom Adapter nicht unterstützt','certificate-unavailable':'Passendes Zertifikat fehlt'}[b?.status]??'Zuordnung ungeprüft';
 return `${b?.capabilityId??''} [${b?.sourceId??''}] · ${b?.profile??''}: ${status} · Quellenanbindung nicht geprüft; keine Berechtigung oder Live-Bestätigung.`;
}
const blockers={
 'power-off':'Numaron ausgeschaltet','controller-not-running':'Controller nicht aktiv','budget-inactive':'Budget nicht aktiv',
 'source-binding-unverified':'Quellbindung ungeprüft','source-evidence-expired':'Quellnachweis abgelaufen',
 'source-evidence-unverified':'Quellnachweis ungeprüft','revision-unverified':'Implementierungsrevision unbelegt'
};
// Advisory only: these steps never call providers, alter grants or start work.
export function capabilityEvidenceNextSteps(entry){
 if(!entry)return [];
 const steps=[],blocks=entry.executionBlockers??[];
 if(entry.implementation!=='present')steps.push('Konkreten Adapter samt unabhängiger Ergebnisprüfung implementieren und isoliert testen.');
 if(blocks.includes('source-binding-unverified'))steps.push('Quellbindung und erlaubte Aktion anhand des konkreten Adapters prüfen.');
 if(!entry.revision)steps.push('Geprüfte Implementierung an eine eindeutige Revision binden.');
 if(blocks.includes('source-evidence-expired')||blocks.includes('source-evidence-unverified'))steps.push('Aktuellen quellspezifischen Aktionsnachweis prüfen; Katalogeinträge genügen nicht.');
 if(['authorization','availability','offlineVerification','liveVerification'].some(d=>entry[d]==='revoked'))steps.push('Widerruf respektieren: Betroffene Nachweisarten bleiben für diese Revision widerrufen. Ursache klären und eine neue geprüfte Revision separat belegen; eine neue Revision erteilt keine Berechtigung.');
 if(entry.authorization!=='confirmed'&&entry.authorization!=='revoked')steps.push(entry.authorization==='denied'?'Verweigerte Berechtigung respektieren; ohne neue ausdrückliche Freigabe gesperrt lassen.':'Berechtigung für die genaue Quelle, Aktion und Revision unabhängig belegen.');
 if(entry.offlineVerification!=='passed'&&entry.offlineVerification!=='revoked')steps.push('Offline-Ablaufprüfung für die aktuelle Revision ausführen und belegen.');
 if(entry.availability!=='observed-available'&&entry.availability!=='revoked')steps.push('Verfügbarkeit später im erlaubten Betrieb prüfen; OFF erlaubt keine Hintergrundabfrage.');
 if(entry.liveVerification!=='observed-success'&&entry.liveVerification!=='revoked')steps.push('Live-Ergebnis bleibt offen; erst im erlaubten Betrieb einen unabhängigen Abschlussbeleg erfassen.');
 if(blocks.includes('power-off'))steps.push('OFF beibehalten; Start ausschließlich durch den persönlichen Dashboard-Klick von Patrice.');
 return steps;
}
export function capabilityEvidenceText(entry,now=Date.now()){
 if(!entry)return 'Nachweise nicht verfügbar.';
 const parts=[['Implementierung','implementation'],['Berechtigung','authorization'],['Verfügbarkeit','availability'],['Offline-Prüfung','offlineVerification'],['Live-Nachweis','liveVerification']]
  .map(([title,key])=>title+': '+(labels[entry[key]]??'unbekannt'));
 const times=(entry.evidence??[]).map(e=>e.observedAt).filter(t=>Number.isSafeInteger(t)&&t>=0&&t<=now);
 parts.push(times.length?'Neuester Beleg vor '+Math.floor((now-Math.max(...times))/1000)+' s':'Belegzeit unbekannt');
 if(entry.executionBlockers?.length)parts.push('Offene Voraussetzungen: '+entry.executionBlockers.map(b=>blockers[b]??(
  b.startsWith('authorization-')?'Berechtigungsnachweis fehlt oder ist widersprüchlich':
  b.startsWith('availability-')?'Aktuelle Verfügbarkeit nicht bestätigt':
  b.startsWith('offline')?'Offline-Prüfung fehlt oder ist widersprüchlich':
  b.startsWith('implementation-')?'Implementierung nicht bestätigt':'Nachweis ungeklärt')).join('; '));
 const steps=capabilityEvidenceNextSteps(entry);
 if(steps.length)parts.push('Nächste Schritte: '+steps.join(' '));
 return parts.join(' · ');
}
