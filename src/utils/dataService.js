import Papa from 'papaparse';

const SPREADSHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1lvICn8Cqjx6qMpf94bibzdyoHMYuzNZ5tzM1AeAvdh4/export?format=csv';

export const fetchSheetData = async () => {
  try {
    const response = await fetch(SPREADSHEET_CSV_URL);
    const csvText = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
};
