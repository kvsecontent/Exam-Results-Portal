const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
app.use(cors({
    origin: '*', // Allow all origins temporarily to debug
    methods: ['GET'],
    allowedHeaders: ['Content-Type']
}));

// Added logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.get('origin') || 'Unknown Origin'}`);
    next();
});

// Health Check Endpoint
app.get('/health', (req, res) => {
    // Log the request headers for debugging
    console.log('Health check headers:', req.headers);
    
    res.status(200).json({ 
        status: 'healthy',
        message: 'Backend is operational',
        timestamp: new Date().toISOString()
    });
});

// Exam Results Endpoint
app.get('/api/exam-results', async (req, res) => {
    try {
        const rollNumber = req.query.rollNumber;
        
        // Log request info for debugging
        console.log(`Fetching results for roll number: ${rollNumber}`);
        console.log('Request headers:', req.headers);
        
        if (!rollNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Roll number is required'
            });
        }

        // Google Sheets API request
        console.log('Fetching from Google Sheets...');
        const response = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/values/Sheet1!A1:Z100`, {
            params: {
                key: process.env.GOOGLE_SHEETS_API_KEY
            }
        });

        // Process and sanitize data
        const rawData = response.data.values || [];
        console.log(`Raw data has ${rawData.length} rows`);
        
        if (rawData.length <= 1) {
            console.warn('Google Sheet has no data or only headers');
            return res.status(500).json({
                status: 'error',
                message: 'No data found in the Google Sheet'
            });
        }
        
        const headers = rawData[0] || [];
        console.log('Sheet headers:', headers);
        
        const results = rawData.slice(1).map(row => 
            headers.reduce((obj, header, index) => {
                obj[header] = row[index] || '';
                return obj;
            }, {})
        );

        // Find student by roll number
        console.log(`Searching for student with roll number: ${rollNumber}`);
        const student = results.find(result => String(result.rollNumber).trim() === String(rollNumber).trim());

        if (!student) {
            console.log(`No student found with roll number: ${rollNumber}`);
            return res.json({
                status: 'error',
                message: 'Student not found'
            });
        }

        console.log(`Found student: ${student.name || 'Unknown'}`);
        
        // Format student data to match frontend expectations
        const formattedStudent = {
            name: student.name || '',
            class: student.class || '',
            school: student.school || 'PM SHRI KENDRIYA VIDYALAYA RAEBARELI',
            subjects: [],
            totalObtained: 0,
            totalMarks: 0,
            percentage: '0',
            cgpa: '0',
            result: 'FAIL'
        };

        // Extract and process subjects
        const subjectKeys = Object.keys(student).filter(key => 
            key.includes('subject') || key.includes('Subject')
        );

        console.log('Found subject keys:', subjectKeys);
        
        let totalObtained = 0;
        let totalMaxMarks = 0;

        // Process subject data
        for (let i = 1; i <= 5; i++) {
            const subjectNameKey = `subject${i}`;
            const subjectMarksKey = `marks${i}`;
            const maxMarksKey = `maxMarks${i}`;

            if (student[subjectNameKey] && student[subjectMarksKey]) {
                const subjectName = student[subjectNameKey];
                const obtainedMarks = parseInt(student[subjectMarksKey]) || 0;
                const maxMarks = parseInt(student[maxMarksKey] || '100');
                
                console.log(`Subject: ${subjectName}, Marks: ${obtainedMarks}/${maxMarks}`);
                
                // Calculate grade
                const percentage = (obtainedMarks / maxMarks) * 100;
                let grade = 'F';
                
                if (percentage >= 90) grade = 'A';
                else if (percentage >= 80) grade = 'B';
                else if (percentage >= 70) grade = 'C';
                else if (percentage >= 60) grade = 'D';

                formattedStudent.subjects.push({
                    name: subjectName,
                    maxMarks: maxMarks,
                    obtained: obtainedMarks,
                    grade: grade
                });

                totalObtained += obtainedMarks;
                totalMaxMarks += maxMarks;
            }
        }

        // Calculate overall results
        formattedStudent.totalObtained = totalObtained;
        formattedStudent.totalMarks = totalMaxMarks;
        
        if (totalMaxMarks > 0) {
            const overallPercentage = (totalObtained / totalMaxMarks) * 100;
            formattedStudent.percentage = overallPercentage.toFixed(2);
            formattedStudent.cgpa = (overallPercentage / 9.5).toFixed(1);
            formattedStudent.result = overallPercentage >= 33 ? 'PASS' : 'FAIL';
        }

        console.log('Sending response with student data');
        
        // Send formatted student data with CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.json({
            status: 'success',
            student: formattedStudent
        });

    } catch (error) {
        console.error('Error fetching exam results:', error.response ? error.response.data : error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        
        res.status(500).json({
            status: 'error',
            message: 'Unable to fetch exam results',
            details: process.env.NODE_ENV === 'development' ? (error.message || 'Unknown error') : undefined
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend proxy server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`CORS: Allowing all origins temporarily for debugging`);
});
