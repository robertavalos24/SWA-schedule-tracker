export async function getOrCreateBackupSpreadsheet(accessToken: string): Promise<string> {
  // Find spreadsheet by name in Drive
  const query = encodeURIComponent("name = 'SWA Schedule Backup' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!searchRes.ok) {
    if (searchRes.status === 401) {
      throw new Error('401_UNAUTHORIZED');
    }
    throw new Error('Failed to search Drive: ' + searchRes.statusText);
  }
  
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: 'SWA Schedule Backup',
      },
      sheets: [
        { properties: { title: 'Logs' } },
        { properties: { title: 'Settings' } },
        { properties: { title: 'FMLA' } },
        { properties: { title: 'System_JSON_Backup', hidden: true } }
      ]
    })
  });
  
  if (!createRes.ok) {
    if (createRes.status === 401) {
      throw new Error('401_UNAUTHORIZED');
    }
    throw new Error('Failed to create Spreadsheet: ' + createRes.statusText);
  }
  
  const createData = await createRes.json();
  return createData.spreadsheetId;
}

export async function writeBackupToSheets(
  accessToken: string, 
  spreadsheetId: string, 
  data: any
) {
  // Create rows for Logs
  const logRows = [['Date', 'Type', 'Hours', 'Premium', 'Note']];
  if (data.logs) {
    Object.keys(data.logs).sort().forEach(date => {
      const entries = data.logs[date];
      if (Array.isArray(entries)) {
        entries.forEach(e => {
          logRows.push([
            date,
            e.type || '',
            String(e.hrs || ''),
            e.prem ? 'Yes' : 'No',
            e.note || ''
          ]);
        });
      }
    });
  }

  // Create rows for Settings
  const settingsRows = [['Key', 'Value']];
  if (data.settings) {
    Object.keys(data.settings).forEach(key => {
      // Stringify complex objects like rules array
      const val = typeof data.settings[key] === 'object' ? JSON.stringify(data.settings[key]) : String(data.settings[key] || '');
      settingsRows.push([key, val]);
    });
  }

  // Create rows for FMLA
  const fmlaRows = [['Number', 'Relation', 'Type', 'Balance', 'Start Date']];
  if (Array.isArray(data.fmlaCases)) {
    data.fmlaCases.forEach(c => {
      fmlaRows.push([
        c.num || '',
        c.rel || '',
        c.leaveType || '',
        String(c.bal || ''),
        c.startD || ''
      ]);
    });
  }
  
  // JSON Dump
  const jsonRows = [['DO NOT EDIT THIS SHEET'], [JSON.stringify(data)]];

  const updateData = [
    { range: 'Logs!A1', values: logRows },
    { range: 'Settings!A1', values: settingsRows },
    { range: 'FMLA!A1', values: fmlaRows },
    { range: 'System_JSON_Backup!A1', values: jsonRows }
  ];

  // We need to use values:batchUpdate
  const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updateData
    })
  });

  if (!batchRes.ok) {
    if (batchRes.status === 401) {
      throw new Error('401_UNAUTHORIZED');
    }
    const err = await batchRes.text();
    throw new Error('Failed to update spreadsheet: ' + err);
  }
}

export async function readBackupFromSheets(accessToken: string, spreadsheetId: string) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/System_JSON_Backup!A2`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('401_UNAUTHORIZED');
    }
    throw new Error('Failed to read from spreadsheet');
  }
  const data = await res.json();
  if (data.values && data.values[0] && data.values[0][0]) {
    return JSON.parse(data.values[0][0]);
  }
  throw new Error('No backup data found in spreadsheet');
}
